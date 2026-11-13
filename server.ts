import 'dotenv/config';
import express, { type NextFunction, type Request, type Response } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { createServer as createViteServer } from 'vite';
import {
  BACKUPS_DIR,
  checkDatabaseHealth,
  closePool,
  createDatabaseBackup,
  DatabaseNotConfiguredError,
  execute,
  initDatabase,
  isDatabaseConfigured,
  listDatabaseBackups,
  query,
  queryOne,
  roundPrivacyCoords,
  withTransaction,
} from './server/db.ts';
import {
  checkStorageHealth,
  createSignedStorageUrl,
  downloadImageBuffer,
  extractStorageObjectPath,
  removeStoredImage,
  uploadImageBuffer,
} from './server/storage.ts';
import {
  analyzeMultiPlantImages,
  analyzeSoilImage,
  checkPythonBackendHealth,
  generateCombinedRecommendations,
  getSupportedCoverageSummary,
  type PlantImageRole,
  type SoilAnalysisResult,
} from './server/vision.ts';
import { fetchOpenMeteoRisk, geocodeLocation, reverseGeocodeLabel, type WeatherRiskResult } from './server/weather.ts';

const app = express();
const PORT = Number(process.env.PORT || 3000);
const SESSION_COOKIE_NAME = 'sasyaraksha_session';

// Trust Render / reverse proxy headers for HTTPS & client IP rate limiting
app.set('trust proxy', 1);

// Security headers & conservative CORS
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  const origin = req.headers.origin;
  const allowedOrigins = [process.env.APP_URL, process.env.RENDER_EXTERNAL_URL].filter(Boolean) as string[];
  if (
    origin &&
    (origin.startsWith('http://localhost:') ||
      origin.startsWith('http://127.0.0.1:') ||
      allowedOrigins.includes(origin))
  ) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  }
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  next();
});

app.use(express.json({ limit: '45mb' }));

// Lightweight sliding-window rate limiter for auth and image analysis endpoints
function createRateLimiter(maxRequests: number, windowMs: number) {
  const buckets = new Map<string, number[]>();
  return (req: Request, res: Response, next: NextFunction) => {
    const key = `${req.ip || 'unknown'}:${req.path}`;
    const now = Date.now();
    const recent = (buckets.get(key) || []).filter((ts) => now - ts < windowMs);
    if (recent.length >= maxRequests) {
      return res.status(429).json({ error: 'Too many requests. Please wait a moment and try again.' });
    }
    recent.push(now);
    buckets.set(key, recent);
    if (buckets.size > 2000) {
      for (const [k, list] of buckets.entries()) {
        if (list.every((ts) => now - ts >= windowMs)) buckets.delete(k);
      }
    }
    next();
  };
}

const authRateLimiter = createRateLimiter(35, 15 * 60 * 1000);
const analyzeRateLimiter = createRateLimiter(30, 15 * 60 * 1000);

function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
): express.RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

function parseTimestampMs(ts: string): number {
  if (!ts) return Date.now();
  const normalized = ts.includes('T') ? ts : `${ts.replace(' ', 'T')}Z`;
  const ms = new Date(normalized).getTime();
  return Number.isNaN(ms) ? Date.now() : ms;
}

interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: 'farmer' | 'expert' | 'admin';
  region: string;
  preferred_language: 'en' | 'hi' | 'kn';
  is_active: number;
}

const VALID_LANGUAGES = new Set(['en', 'hi', 'kn']);
const VALID_ROLES = new Set<PlantImageRole>([
  'closeup_leaf',
  'underside_leaf',
  'multiple_leaves',
  'entire_plant',
  'surrounding_field',
]);
const VALID_UPLOAD_SUBDIRS = new Set(['plants', 'soil', 'processed']);

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  if (!cookieHeader) return {};
  const map: Record<string, string> = {};
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx > 0) {
      const k = part.slice(0, idx).trim();
      const v = part.slice(idx + 1).trim();
      try {
        map[k] = decodeURIComponent(v);
      } catch {
        map[k] = v;
      }
    }
  }
  return map;
}

function setSessionCookie(req: Request, res: Response, token: string) {
  const maxAgeSec = 7 * 24 * 60 * 60;
  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    `Max-Age=${maxAgeSec}`,
    'HttpOnly',
    'SameSite=Lax',
  ];
  const isHttps =
    req.secure ||
    req.headers['x-forwarded-proto'] === 'https' ||
    process.env.APP_URL?.startsWith('https://') ||
    process.env.RENDER_EXTERNAL_URL?.startsWith('https://');
  if (process.env.NODE_ENV === 'production' && isHttps) {
    parts.push('Secure');
  }
  res.setHeader('Set-Cookie', parts.join('; '));
}

function clearSessionCookie(res: Response) {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`);
}

function extractToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const t = authHeader.slice(7).trim();
    if (t) return t;
  }
  const cookies = parseCookies(req.headers.cookie);
  return cookies[SESSION_COOKIE_NAME] || null;
}

async function getAuthUser(req: Request): Promise<AuthUser | null> {
  if (!isDatabaseConfigured()) return null;
  const token = extractToken(req);
  if (!token) return null;

  const row = await queryOne<AuthUser & { expires_at: string }>(
    `SELECT u.id, u.name, u.email, u.role, u.region, u.preferred_language, u.is_active, s.expires_at
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token = $1`,
    [token]
  );

  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now() || row.is_active !== 1) {
    await execute('DELETE FROM sessions WHERE token = $1', [token]);
    return null;
  }
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    region: row.region,
    preferred_language: VALID_LANGUAGES.has(row.preferred_language) ? row.preferred_language : 'en',
    is_active: row.is_active,
  };
}

async function requireAuth(req: Request, res: Response): Promise<AuthUser | null> {
  const user = await getAuthUser(req);
  if (!user) {
    res.status(401).json({ error: 'Authentication required. Please sign in to access your plant records.' });
    return null;
  }
  return user;
}

async function requireExpertOrAdmin(req: Request, res: Response): Promise<AuthUser | null> {
  const user = await getAuthUser(req);
  if (!user) {
    res.status(401).json({ error: 'Authentication required. Please sign in with an Expert or Administrator account.' });
    return null;
  }
  if (user.role !== 'expert' && user.role !== 'admin') {
    res.status(403).json({ error: 'Access denied. Expert or Administrator role is required.' });
    return null;
  }
  return user;
}

async function requireAdmin(req: Request, res: Response): Promise<AuthUser | null> {
  const user = await getAuthUser(req);
  if (!user) {
    res.status(401).json({ error: 'Authentication required. Administrator login required.' });
    return null;
  }
  if (user.role !== 'admin') {
    res.status(403).json({ error: 'Access denied. Administrator role is required.' });
    return null;
  }
  return user;
}

async function logAudit(
  actor: { id: number | null; role: string },
  action: string,
  targetType: string,
  targetId: string | number,
  details: Record<string, unknown> = {}
) {
  await execute(
    `INSERT INTO audit_logs (actor_id, actor_role, action, target_type, target_id, details_json)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [actor.id, actor.role, action, targetType, String(targetId), JSON.stringify(details)]
  );
}

async function createFieldPassport(
  predictionId: number,
  weatherRecordId: number | null,
  dbClient?: { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> }
) {
  const code = `SRP-${new Date().getFullYear()}-${String(predictionId).padStart(5, '0')}`;
  const shareToken = crypto.randomBytes(16).toString('hex');
  const qrPayload = JSON.stringify({
    passportCode: code,
    predictionId,
    verifyUrl: `/?passport=${code}&token=${shareToken}`,
  });

  const runner = dbClient || { query: (sql: string, params?: unknown[]) => query(sql, params).then((rows) => ({ rows })) };

  await runner.query(
    `INSERT INTO field_passports (passport_code, prediction_id, weather_record_id, share_token, is_public_share, qr_payload)
     VALUES ($1, $2, $3, $4, 0, $5)
     ON CONFLICT (prediction_id) DO NOTHING`,
    [code, predictionId, weatherRecordId, shareToken, qrPayload]
  );

  const res = await runner.query('SELECT * FROM field_passports WHERE prediction_id = $1', [predictionId]);
  return res.rows[0];
}

function decodeImageDataUrl(dataUrl: string): { buffer: Buffer; ext: string; mime: string } | null {
  const match = dataUrl.match(/^data:image\/(jpeg|jpg|png|webp);base64,(.+)$/i);
  if (!match) return null;
  const subtype = match[1].toLowerCase();
  const ext = subtype === 'png' ? 'png' : subtype === 'webp' ? 'webp' : 'jpg';
  const mime = subtype === 'png' ? 'image/png' : subtype === 'webp' ? 'image/webp' : 'image/jpeg';
  const buffer = Buffer.from(match[2], 'base64');
  return { buffer, ext, mime };
}

async function checkImageAuthorization(req: Request, relPath: string): Promise<{ allowed: boolean; status: number }> {
  const user = await getAuthUser(req);
  const passportCode = String(req.query.passport || '').trim();
  const shareToken = String(req.query.token || '').trim();

  // 1. Check valid shared Field Passport token
  if (passportCode && shareToken) {
    const shared = await queryOne<{
      prediction_id: number;
      original_image_path: string;
      processed_image_path: string;
    }>(
      `SELECT fp.prediction_id, p.original_image_path, p.processed_image_path
       FROM field_passports fp
       JOIN predictions p ON p.id = fp.prediction_id
       WHERE fp.passport_code = $1 AND fp.share_token = $2 AND fp.is_public_share = 1`,
      [passportCode, shareToken]
    );

    if (shared) {
      if (shared.original_image_path === relPath || shared.processed_image_path === relPath) {
        return { allowed: true, status: 200 };
      }
      const linkedImg = await queryOne<{ id: number }>(
        `SELECT id FROM screening_images WHERE prediction_id = $1 AND (original_path = $2 OR processed_path = $3)`,
        [shared.prediction_id, relPath, relPath]
      );
      if (linkedImg) return { allowed: true, status: 200 };
    }
  }

  if (!user) {
    return { allowed: false, status: 401 };
  }

  // 2. Authorized experts/admins may view images attached to screening predictions in review workflows
  if (user.role === 'expert' || user.role === 'admin') {
    return { allowed: true, status: 200 };
  }

  // 3. Farmer ownership verification across predictions, screening_images, soil_records, progression_entries
  const predOwner = await queryOne<{ id: number }>(
    `SELECT id FROM predictions
     WHERE user_id = $1 AND (original_image_path = $2 OR processed_image_path = $3)
     LIMIT 1`,
    [user.id, relPath, relPath]
  );
  if (predOwner) return { allowed: true, status: 200 };

  const multiOwner = await queryOne<{ id: number }>(
    `SELECT si.id
     FROM screening_images si
     JOIN predictions p ON p.id = si.prediction_id
     WHERE p.user_id = $1 AND (si.original_path = $2 OR si.processed_path = $3)
     LIMIT 1`,
    [user.id, relPath, relPath]
  );
  if (multiOwner) return { allowed: true, status: 200 };

  const soilOwner = await queryOne<{ id: number }>(
    `SELECT sr.id
     FROM soil_records sr
     JOIN predictions p ON p.id = sr.prediction_id
     WHERE p.user_id = $1 AND sr.soil_photo_path = $2
     LIMIT 1`,
    [user.id, relPath]
  );
  if (soilOwner) return { allowed: true, status: 200 };

  const progOwner = await queryOne<{ id: number }>(
    `SELECT id FROM progression_entries WHERE user_id = $1 AND followup_image_path = $2 LIMIT 1`,
    [user.id, relPath]
  );
  if (progOwner) return { allowed: true, status: 200 };

  return { allowed: false, status: 403 };
}

// Optional signed-url helper for authenticated image holders (private Supabase Storage bucket)
app.get(
  '/api/uploads/signed-url',
  asyncHandler(async (req, res) => {
    const relPath = String(req.query.path || '').trim();
    if (!relPath.startsWith('/api/uploads/')) {
      return res.status(400).json({ error: 'Valid /api/uploads/... path required.' });
    }
    const authz = await checkImageAuthorization(req, relPath);
    if (!authz.allowed) {
      return res.status(authz.status).json({
        error: authz.status === 401 ? 'Authentication required.' : 'Access denied.',
      });
    }
    const objPath = extractStorageObjectPath(relPath);
    if (!objPath) return res.status(404).json({ error: 'Image not found' });
    const signedUrl = await createSignedStorageUrl(objPath, 300);
    if (!signedUrl) {
      return res.json({ signedUrl: relPath, storageMode: 'proxied' });
    }
    return res.json({ signedUrl, expiresIn: 300, storageMode: 'supabase-signed' });
  })
);

// Protected upload & processed image serving from private Supabase Storage bucket (with auth + RBAC + passport verification)
app.get(
  '/api/uploads/:subdir/:filename',
  asyncHandler(async (req, res) => {
    const subdir = String(req.params.subdir || '');
    if (!VALID_UPLOAD_SUBDIRS.has(subdir)) {
      return res.status(404).json({ error: 'Invalid upload directory' });
    }
    const safeName = path.basename(req.params.filename);
    const relUrl = `/api/uploads/${subdir}/${safeName}`;

    const authz = await checkImageAuthorization(req, relUrl);
    if (!authz.allowed) {
      return res.status(authz.status).json({
        error: authz.status === 401 ? 'Authentication required to view private plant images.' : 'Access denied.',
      });
    }

    const file = await downloadImageBuffer(`${subdir}/${safeName}`);
    if (!file) {
      return res.status(404).json({ error: 'Image not found' });
    }

    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    return res.send(file.buffer);
  })
);

app.get(
  '/api/uploads/:filename',
  asyncHandler(async (req, res) => {
    const safeName = path.basename(req.params.filename);
    const candidates = [
      { obj: safeName, url: `/api/uploads/${safeName}` },
      { obj: `plants/${safeName}`, url: `/api/uploads/plants/${safeName}` },
      { obj: `processed/${safeName}`, url: `/api/uploads/processed/${safeName}` },
      { obj: `soil/${safeName}`, url: `/api/uploads/soil/${safeName}` },
    ];

    for (const c of candidates) {
      const file = await downloadImageBuffer(c.obj);
      if (file) {
        const authz = await checkImageAuthorization(req, c.url);
        if (!authz.allowed) {
          return res.status(authz.status).json({
            error: authz.status === 401 ? 'Authentication required to view private plant images.' : 'Access denied.',
          });
        }
        res.setHeader('Content-Type', file.contentType);
        res.setHeader('Cache-Control', 'private, max-age=3600');
        return res.send(file.buffer);
      }
    }

    return res.status(404).json({ error: 'Image not found' });
  })
);

// System & AI Engine Health
app.get(
  '/api/health',
  asyncHandler(async (_req, res) => {
    const [python, dbHealth, storageHealth] = await Promise.all([
      checkPythonBackendHealth(),
      checkDatabaseHealth(),
      checkStorageHealth(),
    ]);
    const status = !dbHealth.configured || dbHealth.connected ? 'ok' : 'degraded';
    res.status(status === 'ok' ? 200 : 503).json({
      status,
      appName: 'SasyaRaksha',
      database: dbHealth.engine,
      databaseConfigured: dbHealth.configured,
      databaseConnected: dbHealth.connected,
      storage: storageHealth,
      pythonBackend: python,
      activeEngine: python.connected && python.modelReady ? 'pytorch-mobilenetv3-opencv' : 'local-cv-spectral',
      supportedCoverage: getSupportedCoverageSummary(),
    });
  })
);

// Non-sensitive platform summary
app.get(
  '/api/home-summary',
  asyncHandler(async (req, res) => {
    if (!isDatabaseConfigured()) {
      return res.json({ outbreakAlerts: [], totalGeoReports: 0, userSummary: null });
    }
    const user = await getAuthUser(req);
    const outbreakAlerts = await query(
      `SELECT region_label, crop, disease, COUNT(*)::int AS report_count, MAX(reported_at) AS latest_date,
              SUM(verified)::int AS verified_count
       FROM geographical_reports
       GROUP BY region_label, crop, disease
       ORDER BY report_count DESC, latest_date DESC
       LIMIT 4`
    );

    const totalRow = await queryOne<{ cnt: number }>('SELECT COUNT(*)::int AS cnt FROM geographical_reports');
    const totalGeoReports = totalRow?.cnt || 0;

    let userSummary: { totalScreenings: number; trackedPlants: number; latestWeather: unknown } | null = null;
    if (user) {
      const [sc, pl, lw] = await Promise.all([
        queryOne<{ cnt: number }>('SELECT COUNT(*)::int AS cnt FROM predictions WHERE user_id = $1', [user.id]),
        queryOne<{ cnt: number }>('SELECT COUNT(*)::int AS cnt FROM plants WHERE owner_id = $1', [user.id]),
        queryOne('SELECT * FROM weather_records WHERE user_id = $1 ORDER BY recorded_at DESC, id DESC LIMIT 1', [user.id]),
      ]);
      userSummary = {
        totalScreenings: sc?.cnt || 0,
        trackedPlants: pl?.cnt || 0,
        latestWeather: lw || null,
      };
    }

    return res.json({
      outbreakAlerts,
      totalGeoReports,
      userSummary,
    });
  })
);

// Auth endpoints
app.post(
  '/api/auth/register',
  authRateLimiter,
  asyncHandler(async (req, res) => {
    const { name, email, password, region = 'General Agricultural Zone', preferredLanguage = 'en' } = req.body as {
      name?: string;
      email?: string;
      password?: string;
      region?: string;
      preferredLanguage?: string;
    };

    if (!name?.trim() || !email?.trim() || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required.' });
    }
    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }

    const lang = VALID_LANGUAGES.has(preferredLanguage) ? preferredLanguage : 'en';
    const existing = await queryOne<{ id: number }>('SELECT id FROM users WHERE email = $1', [normalizedEmail]);
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    const trimmedRegion = region.trim() || 'General Agricultural Zone';
    const inserted = await queryOne<{ id: number }>(
      `INSERT INTO users (name, email, password_hash, role, region, preferred_language, is_active)
       VALUES ($1, $2, $3, 'farmer', $4, $5, 1)
       RETURNING id`,
      [name.trim(), normalizedEmail, bcrypt.hashSync(password, 10), trimmedRegion, lang]
    );

    const userId = Number(inserted!.id);
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    await execute('INSERT INTO sessions (token, user_id, expires_at) VALUES ($1, $2, $3)', [token, userId, expiresAt]);
    setSessionCookie(req, res, token);
    await logAudit({ id: userId, role: 'farmer' }, 'auth.register', 'user', userId, { region: trimmedRegion });

    return res.status(201).json({
      token,
      user: {
        id: userId,
        name: name.trim(),
        email: normalizedEmail,
        role: 'farmer',
        region: trimmedRegion,
        preferred_language: lang,
      },
    });
  })
);

app.post(
  '/api/auth/login',
  authRateLimiter,
  asyncHandler(async (req, res) => {
    const { email, password, portal = 'general' } = req.body as {
      email?: string;
      password?: string;
      portal?: 'general' | 'expert';
    };
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const user = await queryOne<AuthUser & { password_hash: string }>(
      'SELECT id, name, email, password_hash, role, region, preferred_language, is_active FROM users WHERE email = $1',
      [email.trim().toLowerCase()]
    );

    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }
    if (user.is_active !== 1) {
      return res.status(403).json({ error: 'This account has been deactivated by an Administrator.' });
    }
    if (portal === 'expert' && user.role !== 'expert' && user.role !== 'admin') {
      return res.status(403).json({
        error: 'Expert Portal access is restricted to authorized Agricultural Experts and Administrators.',
      });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    await execute('INSERT INTO sessions (token, user_id, expires_at) VALUES ($1, $2, $3)', [token, user.id, expiresAt]);
    setSessionCookie(req, res, token);
    await logAudit({ id: user.id, role: user.role }, 'auth.login', 'user', user.id, { portal });

    return res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        region: user.region,
        preferred_language: VALID_LANGUAGES.has(user.preferred_language) ? user.preferred_language : 'en',
      },
    });
  })
);

app.post(
  '/api/auth/logout',
  asyncHandler(async (req, res) => {
    const token = extractToken(req);
    if (token && isDatabaseConfigured()) {
      await execute('DELETE FROM sessions WHERE token = $1', [token]);
    }
    clearSessionCookie(res);
    res.json({ ok: true });
  })
);

app.get(
  '/api/auth/me',
  asyncHandler(async (req, res) => {
    const user = await getAuthUser(req);
    if (!user) return res.status(401).json({ error: 'Not authenticated' });
    return res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        region: user.region,
        preferred_language: user.preferred_language,
      },
    });
  })
);

app.patch(
  '/api/auth/language',
  asyncHandler(async (req, res) => {
    const user = await requireAuth(req, res);
    if (!user) return;
    const { language } = req.body as { language?: string };
    if (!language || !VALID_LANGUAGES.has(language)) {
      return res.status(400).json({ error: 'Language must be en, hi, or kn.' });
    }
    await execute('UPDATE users SET preferred_language = $1 WHERE id = $2', [language, user.id]);
    return res.json({ ok: true, preferred_language: language });
  })
);

app.post(
  '/api/auth/change-password',
  asyncHandler(async (req, res) => {
    const user = await requireAuth(req, res);
    if (!user) return;
    const { currentPassword, newPassword } = req.body as { currentPassword?: string; newPassword?: string };
    if (!currentPassword || !newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'Current password and a new password (min 6 characters) are required.' });
    }
    const row = await queryOne<{ password_hash: string }>('SELECT password_hash FROM users WHERE id = $1', [user.id]);
    if (!row || !bcrypt.compareSync(currentPassword, row.password_hash)) {
      return res.status(401).json({ error: 'Current password is incorrect.' });
    }
    await execute('UPDATE users SET password_hash = $1 WHERE id = $2', [bcrypt.hashSync(newPassword, 10), user.id]);
    await logAudit({ id: user.id, role: user.role }, 'auth.change_password', 'user', user.id);
    return res.json({ ok: true, message: 'Password updated securely.' });
  })
);

app.post(
  '/api/auth/reset-request',
  authRateLimiter,
  asyncHandler(async (req, res) => {
    const { email } = req.body as { email?: string };
    if (!email?.trim()) {
      return res.status(400).json({ error: 'Email address is required.' });
    }
    const normalized = email.trim().toLowerCase();
    const target = await queryOne<{ id: number }>('SELECT id FROM users WHERE email = $1', [normalized]);
    const smtpConfigured = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER);
    if (target && smtpConfigured) {
      const rawToken = crypto.randomBytes(24).toString('hex');
      const hash = crypto.createHash('sha256').update(rawToken).digest('hex');
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      await execute('INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)', [
        target.id,
        hash,
        expiresAt,
      ]);
    }
    return res.json({
      ok: true,
      emailDeliveryAvailable: smtpConfigured,
      message: smtpConfigured
        ? 'If an account matches that email, a password reset link has been sent.'
        : 'Please change your password from your signed-in account or contact an administrator.',
    });
  })
);

app.post(
  '/api/auth/reset-confirm',
  authRateLimiter,
  asyncHandler(async (req, res) => {
    const { token, newPassword } = req.body as { token?: string; newPassword?: string };
    if (!token?.trim() || !newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'Valid reset token and new password (min 6 characters) are required.' });
    }
    const hash = crypto.createHash('sha256').update(token.trim()).digest('hex');
    const row = await queryOne<{ id: number; user_id: number; expires_at: string; used_at: string | null }>(
      'SELECT id, user_id, expires_at, used_at FROM password_reset_tokens WHERE token_hash = $1',
      [hash]
    );

    if (!row || row.used_at || new Date(row.expires_at).getTime() < Date.now()) {
      return res.status(400).json({ error: 'Invalid or expired password reset token.' });
    }

    await execute('UPDATE users SET password_hash = $1 WHERE id = $2', [bcrypt.hashSync(newPassword, 10), row.user_id]);
    await execute('UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1', [row.id]);
    await execute('DELETE FROM sessions WHERE user_id = $1', [row.user_id]);
    return res.json({ ok: true, message: 'Password reset successful. Please sign in with your new password.' });
  })
);

// User-Isolated Dashboard Overview
app.get(
  '/api/dashboard',
  asyncHandler(async (req, res) => {
    const user = await requireAuth(req, res);
    if (!user) return;

    const stats = await queryOne<{
      totalScreenings: number;
      healthyPredictions: number | null;
      diseaseDetections: number | null;
      casesRequiringReview: number | null;
    }>(
      `SELECT
        COUNT(*)::int AS "totalScreenings",
        COALESCE(SUM(CASE WHEN COALESCE(verified_disease, predicted_disease) = 'Healthy' THEN 1 ELSE 0 END), 0)::int AS "healthyPredictions",
        COALESCE(SUM(CASE WHEN COALESCE(verified_disease, predicted_disease) != 'Healthy' THEN 1 ELSE 0 END), 0)::int AS "diseaseDetections",
        COALESCE(SUM(CASE WHEN verification_status = 'pending' THEN 1 ELSE 0 END), 0)::int AS "casesRequiringReview"
       FROM predictions
       WHERE user_id = $1`,
      [user.id]
    );

    const recentScreenings = await query(
      `SELECT p.id, p.crop, p.predicted_disease, p.condition_category, p.verified_crop, p.verified_disease, p.confidence, p.uncertain,
              p.affected_area_pct, p.severity, p.verification_status, p.original_image_path, p.processed_image_path,
              p.region_label, p.plant_id, p.created_at, fp.passport_code
       FROM predictions p
       LEFT JOIN field_passports fp ON fp.prediction_id = p.id
       WHERE p.user_id = $1
       ORDER BY p.created_at DESC, p.id DESC
       LIMIT 10`,
      [user.id]
    );

    const latestWeather = await queryOne(
      'SELECT * FROM weather_records WHERE user_id = $1 ORDER BY recorded_at DESC, id DESC LIMIT 1',
      [user.id]
    );

    return res.json({
      stats: {
        totalScreenings: stats?.totalScreenings || 0,
        healthyPredictions: stats?.healthyPredictions || 0,
        diseaseDetections: stats?.diseaseDetections || 0,
        casesRequiringReview: stats?.casesRequiringReview || 0,
      },
      recentScreenings,
      latestWeather: latestWeather || null,
    });
  })
);

// Authenticated Multi-Image Plant & Optional Soil Screening Pipeline
app.post(
  '/api/analyze',
  analyzeRateLimiter,
  asyncHandler(async (req, res) => {
    const user = await requireAuth(req, res);
    if (!user) return;

    const uploadedUrlsForCleanup: string[] = [];

    try {
      const body = req.body as {
        imageBase64?: string;
        filename?: string;
        images?: Array<{ imageBase64: string; filename?: string; role?: PlantImageRole }>;
        soilImageBase64?: string;
        soilFilename?: string;
        manualSoil?: {
          moisture?: string;
          ph?: string;
          soilType?: string;
          fertility?: string;
        };
        symptoms?: string[];
        durationValue?: number | null;
        durationUnit?: string;
        cropHint?: string;
        plantId?: number | null;
        fieldLabel?: string;
        regionLabel?: string;
        approxLat?: number | null;
        approxLng?: number | null;
        notes?: string;
        reportOutbreak?: boolean;
      };

      // If attaching to an existing plant record, strictly verify ownership
      let targetPlantId: number | null = body.plantId ? Number(body.plantId) : null;
      if (targetPlantId !== null) {
        const ownedPlant = await queryOne<{ id: number; owner_id: number | null }>(
          'SELECT id, owner_id FROM plants WHERE id = $1',
          [targetPlantId]
        );
        if (!ownedPlant) {
          return res.status(404).json({ error: 'Selected plant record does not exist.' });
        }
        if (ownedPlant.owner_id !== user.id) {
          return res.status(403).json({ error: 'Access denied. You do not own this plant record.' });
        }
      }

      const incomingImages =
        Array.isArray(body.images) && body.images.length > 0
          ? body.images
          : body.imageBase64
          ? [{ imageBase64: body.imageBase64, filename: body.filename || 'leaf_upload.jpg', role: 'closeup_leaf' as PlantImageRole }]
          : [];

      if (incomingImages.length === 0) {
        return res.status(400).json({ error: 'Please select or capture at least one plant photograph.' });
      }
      if (incomingImages.length > 8) {
        return res.status(400).json({ error: 'Maximum 8 plant photographs per screening.' });
      }

      const preparedImages: Array<{
        buffer: Buffer;
        filename: string;
        role: PlantImageRole;
        originalUrlPath: string;
        mime: string;
        sizeBytes: number;
      }> = [];

      for (let i = 0; i < incomingImages.length; i++) {
        const item = incomingImages[i];
        const decoded = decodeImageDataUrl(item.imageBase64 || '');
        if (!decoded) {
          await Promise.all(uploadedUrlsForCleanup.map((u) => removeStoredImage(u)));
          return res.status(400).json({ error: 'Invalid image format. Only JPG, JPEG, PNG, and WebP photographs are supported.' });
        }
        if (decoded.buffer.byteLength > 10 * 1024 * 1024) {
          await Promise.all(uploadedUrlsForCleanup.map((u) => removeStoredImage(u)));
          return res.status(400).json({ error: `Image #${i + 1} exceeds 10 MB size limit.` });
        }
        const rawName = item.filename || `plant_${i + 1}.${decoded.ext}`;
        const safeBase = path.basename(rawName, path.extname(rawName)).replace(/[^a-zA-Z0-9_-]/g, '') || 'leaf';
        const savedName = `plant_u${user.id}_${Date.now()}_${i}_${crypto.randomBytes(3).toString('hex')}_${safeBase}.${decoded.ext}`;

        const uploaded = await uploadImageBuffer({
          subdir: 'plants',
          filename: savedName,
          buffer: decoded.buffer,
          contentType: decoded.mime,
        });
        uploadedUrlsForCleanup.push(uploaded.apiUrl);

        const role: PlantImageRole = item.role && VALID_ROLES.has(item.role) ? item.role : 'closeup_leaf';
        preparedImages.push({
          buffer: decoded.buffer,
          filename: rawName,
          role,
          originalUrlPath: uploaded.apiUrl,
          mime: decoded.mime,
          sizeBytes: decoded.buffer.byteLength,
        });
      }

      const symptoms = Array.isArray(body.symptoms) ? body.symptoms.filter((s) => typeof s === 'string').slice(0, 12) : [];
      const analysis = await analyzeMultiPlantImages(preparedImages, body.cropHint || 'Auto-Detect', symptoms);

      for (const f of analysis.imageFindings) {
        if (f.processedPath) uploadedUrlsForCleanup.push(f.processedPath);
      }

      if (!analysis.suitable) {
        await Promise.all(uploadedUrlsForCleanup.map((u) => removeStoredImage(u)));
        return res.status(422).json({
          error: analysis.rejectionReason || 'Uploaded image(s) did not show clear plant leaves.',
          suitable: false,
          leafCoveragePct: analysis.leafCoveragePct,
          imageFindings: analysis.imageFindings,
        });
      }

      let resolvedRegion = (body.regionLabel || '').trim();

      // Optional soil image analysis
      let soilAnalysis: SoilAnalysisResult | null = null;
      let soilPhotoUrl = '';
      if (body.soilImageBase64) {
        const decodedSoil = decodeImageDataUrl(body.soilImageBase64);
        if (decodedSoil && decodedSoil.buffer.byteLength <= 10 * 1024 * 1024) {
          const sResult = await analyzeSoilImage(decodedSoil.buffer);
          soilAnalysis = sResult;
          if (sResult.suitable) {
            const safeSoilBase =
              path.basename(body.soilFilename || 'soil.jpg', path.extname(body.soilFilename || 'soil.jpg')).replace(
                /[^a-zA-Z0-9_-]/g,
                ''
              ) || 'soil';
            const soilSavedName = `soil_u${user.id}_${Date.now()}_${crypto.randomBytes(3).toString('hex')}_${safeSoilBase}.${decodedSoil.ext}`;
            const uploadedSoil = await uploadImageBuffer({
              subdir: 'soil',
              filename: soilSavedName,
              buffer: decodedSoil.buffer,
              contentType: decodedSoil.mime,
            });
            soilPhotoUrl = uploadedSoil.apiUrl;
            uploadedUrlsForCleanup.push(soilPhotoUrl);
          }
        }
      }

      // Resolve location & Open-Meteo weather BEFORE DB transaction
      let resolvedLat: number | null = typeof body.approxLat === 'number' && !Number.isNaN(body.approxLat) ? body.approxLat : null;
      let resolvedLng: number | null = typeof body.approxLng === 'number' && !Number.isNaN(body.approxLng) ? body.approxLng : null;

      if ((resolvedLat === null || resolvedLng === null) && resolvedRegion) {
        const geo = await geocodeLocation(resolvedRegion).catch(() => null);
        if (geo) {
          resolvedLat = geo.latitude;
          resolvedLng = geo.longitude;
          resolvedRegion = geo.name;
        }
      } else if (resolvedLat !== null && resolvedLng !== null && !resolvedRegion) {
        resolvedRegion = await reverseGeocodeLabel(resolvedLat, resolvedLng);
      }

      let weatherRisk: WeatherRiskResult | null = null;
      let weatherError = '';
      if (resolvedLat !== null && resolvedLng !== null) {
        try {
          weatherRisk = await fetchOpenMeteoRisk(
            resolvedRegion || `${resolvedLat.toFixed(2)}, ${resolvedLng.toFixed(2)}`,
            resolvedLat,
            resolvedLng,
            analysis.crop
          );
        } catch (err) {
          weatherError = err instanceof Error ? err.message : 'Unable to fetch Open-Meteo weather right now.';
        }
      }

      const manualSoil = body.manualSoil || null;
      const combinedRecommendations = generateCombinedRecommendations({
        crop: analysis.crop,
        disease: analysis.predictedDisease,
        category: analysis.conditionCategory,
        weatherRisk: weatherRisk
          ? {
              temperatureC: weatherRisk.temperatureC,
              humidityPct: weatherRisk.humidityPct,
              rainfallMm: weatherRisk.rainfallMm,
              riskLevel: weatherRisk.riskLevel,
            }
          : null,
        soilObservation: soilAnalysis?.suitable ? soilAnalysis : null,
        manualSoil,
        symptoms,
      });

      const fuzzedCoords =
        resolvedLat !== null && resolvedLng !== null ? roundPrivacyCoords(resolvedLat, resolvedLng) : { lat: null, lng: null };

      const primaryValidFinding = analysis.imageFindings.find((f) => f.suitable) || analysis.imageFindings[0];
      const primaryOriginalUrl = primaryValidFinding.originalPath;
      const primaryProcessedUrl = `/api/uploads/processed/${analysis.processedImageFilename}`;

      const durationValue =
        typeof body.durationValue === 'number' && !Number.isNaN(body.durationValue) && body.durationValue > 0
          ? Math.round(body.durationValue)
          : null;
      const durationUnit: string =
        body.durationUnit && ['days', 'weeks', 'months'].includes(body.durationUnit) ? body.durationUnit : '';

      const libraryEntry = await queryOne<{ expected_outcome?: string; [key: string]: unknown }>(
        'SELECT * FROM disease_library WHERE LOWER(crop) = LOWER($1) AND LOWER(disease_name) = LOWER($2)',
        [analysis.crop, analysis.predictedDisease]
      );

      // Persist all relational records atomically in PostgreSQL
      const txResult = await withTransaction(async (client) => {
        let finalPlantId = targetPlantId;
        if (finalPlantId === null) {
          const code = `PLT-${analysis.crop.slice(0, 3).toUpperCase()}-${Date.now().toString().slice(-5)}${Math.floor(Math.random() * 10)}`;
          const label = (body.fieldLabel || '').trim() || `${analysis.crop} Field Scan (${new Date().toISOString().slice(0, 10)})`;
          const newPlant = await client.query<{ id: number }>(
            'INSERT INTO plants (plant_code, crop, field_label, region_label, owner_id) VALUES ($1, $2, $3, $4, $5) RETURNING id',
            [code, analysis.crop, label, resolvedRegion || user.region || '', user.id]
          );
          finalPlantId = Number(newPlant.rows[0].id);
        }

        let weatherRecordId: number | null = null;
        if (weatherRisk) {
          const wRes = await client.query<{ id: number }>(
            `INSERT INTO weather_records (user_id, location_name, latitude, longitude, crop, temperature_c, humidity_pct, rainfall_mm, risk_level, risk_factors_json, time_period, is_demo)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 0)
             RETURNING id`,
            [
              user.id,
              weatherRisk.locationName,
              weatherRisk.latitude,
              weatherRisk.longitude,
              weatherRisk.crop,
              weatherRisk.temperatureC,
              weatherRisk.humidityPct,
              weatherRisk.rainfallMm,
              weatherRisk.riskLevel,
              JSON.stringify(weatherRisk.riskFactors),
              weatherRisk.timePeriod,
            ]
          );
          weatherRecordId = Number(wRes.rows[0].id);
        }

        const predInsert = await client.query<{ id: number }>(
          `INSERT INTO predictions (
            plant_id, user_id, weather_record_id, crop, predicted_disease, condition_category, confidence, uncertain, uncertainty_reason,
            alternative_predictions_json, affected_area_pct, severity, leaf_coverage_pct, chlorosis_pct, necrosis_pct,
            original_image_path, processed_image_path, model_engine, verification_status,
            region_label, approx_lat, approx_lng, notes, symptoms_json, symptom_onset_value, symptom_onset_unit,
            image_consistency, consistency_message, recommendations_json, is_demo
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9,
            $10, $11, $12, $13, $14, $15,
            $16, $17, $18, 'pending',
            $19, $20, $21, $22, $23, $24, $25,
            $26, $27, $28, 0
          ) RETURNING id`,
          [
            finalPlantId,
            user.id,
            weatherRecordId,
            analysis.crop,
            analysis.predictedDisease,
            analysis.conditionCategory,
            analysis.confidence,
            analysis.uncertain ? 1 : 0,
            analysis.uncertaintyReason,
            JSON.stringify(analysis.alternativePredictions),
            analysis.affectedAreaPct,
            analysis.severity,
            analysis.leafCoveragePct,
            analysis.chlorosisPct,
            analysis.necrosisPct,
            primaryOriginalUrl,
            primaryProcessedUrl,
            analysis.modelEngine,
            resolvedRegion,
            fuzzedCoords.lat,
            fuzzedCoords.lng,
            (body.notes || '').trim(),
            JSON.stringify(symptoms),
            durationValue,
            durationUnit,
            analysis.consistencyStatus,
            analysis.consistencyMessage,
            JSON.stringify(combinedRecommendations),
          ]
        );
        const predictionId = Number(predInsert.rows[0].id);

        for (let i = 0; i < analysis.imageFindings.length; i++) {
          const f = analysis.imageFindings[i];
          const prep = preparedImages[i];
          await client.query(
            `INSERT INTO screening_images (
              prediction_id, image_role, original_path, processed_path, suitable, rejection_reason,
              detected_crop, detected_disease, confidence, affected_area_pct, severity, mime_type, file_size_bytes, width, height
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
            [
              predictionId,
              f.role,
              f.originalPath,
              f.processedPath,
              f.suitable ? 1 : 0,
              f.rejectionReason || '',
              f.crop,
              f.predictedDisease,
              f.confidence,
              f.affectedAreaPct,
              f.severity,
              prep?.mime || 'image/jpeg',
              prep?.sizeBytes || 0,
              f.imageWidth,
              f.imageHeight,
            ]
          );
        }

        if (
          soilPhotoUrl ||
          (soilAnalysis && !soilAnalysis.suitable) ||
          (manualSoil && (manualSoil.moisture || manualSoil.ph || manualSoil.soilType || manualSoil.fertility))
        ) {
          await client.query(
            `INSERT INTO soil_records (
              prediction_id, soil_photo_path, observed_color, observed_moisture, observed_texture, observed_surface_signs,
              soil_disclaimer, manual_moisture, manual_ph, manual_soil_type, manual_fertility, recommendations_json
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
            [
              predictionId,
              soilPhotoUrl,
              soilAnalysis?.suitable ? soilAnalysis.observedColor : soilAnalysis?.rejectionReason || '',
              soilAnalysis?.suitable ? soilAnalysis.observedMoisture : '',
              soilAnalysis?.suitable ? soilAnalysis.observedTexture : '',
              soilAnalysis?.suitable ? soilAnalysis.observedSurfaceSigns : '',
              soilAnalysis?.disclaimer || '',
              manualSoil?.moisture || '',
              manualSoil?.ph || '',
              manualSoil?.soilType || '',
              manualSoil?.fertility || '',
              JSON.stringify(combinedRecommendations),
            ]
          );
        }

        await client.query(
          `INSERT INTO uploaded_images (prediction_id, original_path, processed_path, mime_type, file_size_bytes, width, height)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            predictionId,
            primaryOriginalUrl,
            primaryProcessedUrl,
            preparedImages[0]?.mime || 'image/jpeg',
            preparedImages[0]?.sizeBytes || 0,
            analysis.imageWidth,
            analysis.imageHeight,
          ]
        );

        await client.query(
          `INSERT INTO severity_analyses (prediction_id, affected_area_pct, severity, leaf_coverage_pct, chlorosis_pct, necrosis_pct, rust_pct, powdery_pct, leaf_pixels, infected_pixels)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            predictionId,
            analysis.affectedAreaPct,
            analysis.severity,
            analysis.leafCoveragePct,
            analysis.chlorosisPct,
            analysis.necrosisPct,
            analysis.rustPct,
            analysis.powderyPct,
            analysis.leafPixels,
            analysis.infectedPixels,
          ]
        );

        const passport = await createFieldPassport(predictionId, weatherRecordId, client);

        if (
          body.reportOutbreak !== false &&
          fuzzedCoords.lat !== null &&
          fuzzedCoords.lng !== null &&
          analysis.predictedDisease !== 'Healthy'
        ) {
          await client.query(
            `INSERT INTO geographical_reports (prediction_id, crop, disease, severity, region_label, approx_lat, approx_lng, verified, is_demo)
             VALUES ($1, $2, $3, $4, $5, $6, $7, 0, 0)`,
            [
              predictionId,
              analysis.crop,
              analysis.predictedDisease,
              analysis.severity,
              resolvedRegion || 'Reported Agricultural Zone',
              fuzzedCoords.lat,
              fuzzedCoords.lng,
            ]
          );
        }

        let progression: {
          previousAffectedPct: number;
          deltaPct: number;
          trend: 'Improving' | 'Spreading' | 'Relatively Unchanged';
          previousDate: string;
        } | null = null;

        if (finalPlantId) {
          const prevRes = await client.query<{ affected_area_pct: number; created_at: string }>(
            `SELECT affected_area_pct, created_at FROM predictions
             WHERE plant_id = $1 AND user_id = $2 AND id < $3
             ORDER BY id DESC LIMIT 1`,
            [finalPlantId, user.id, predictionId]
          );
          const prev = prevRes.rows[0];

          const countRes = await client.query<{ cnt: number }>(
            'SELECT COUNT(*)::int AS cnt FROM predictions WHERE plant_id = $1 AND user_id = $2',
            [finalPlantId, user.id]
          );
          const scanCount = countRes.rows[0]?.cnt || 1;

          let trendText = 'Baseline Scan';
          if (prev) {
            const delta = Number((analysis.affectedAreaPct - prev.affected_area_pct).toFixed(2));
            let trend: 'Improving' | 'Spreading' | 'Relatively Unchanged' = 'Relatively Unchanged';
            if (delta <= -2.0) trend = 'Improving';
            else if (delta >= 2.0) trend = 'Spreading';
            trendText = `${trend} (${delta > 0 ? '+' : ''}${delta}% vs previous scan)`;
            progression = {
              previousAffectedPct: prev.affected_area_pct,
              deltaPct: delta,
              trend,
              previousDate: prev.created_at,
            };
          }

          const firstRes = await client.query<{ created_at: string }>(
            'SELECT created_at FROM predictions WHERE plant_id = $1 AND user_id = $2 ORDER BY created_at ASC, id ASC LIMIT 1',
            [finalPlantId, user.id]
          );
          const firstScan = firstRes.rows[0];
          const dayNumber = firstScan
            ? Math.max(1, Math.floor((Date.now() - parseTimestampMs(firstScan.created_at)) / (1000 * 60 * 60 * 24)) + 1)
            : 1;

          await client.query(
            `INSERT INTO progression_entries (
              plant_id, prediction_id, user_id, day_number, treatment_status, medicine_applied,
              application_date, observed_symptoms, disease_progression, followup_image_path,
              expected_outcome, actual_outcome
            ) VALUES ($1, $2, $3, $4, $5, '', $6, $7, $8, $9, $10, $11)`,
            [
              finalPlantId,
              predictionId,
              user.id,
              scanCount === 1 ? 1 : dayNumber,
              analysis.predictedDisease === 'Healthy' ? 'Completed' : 'Planned',
              new Date().toISOString().slice(0, 10),
              symptoms.length > 0 ? symptoms.join(', ') : `${analysis.severity} severity (${analysis.affectedAreaPct}% leaf area)`,
              trendText,
              primaryProcessedUrl,
              (libraryEntry?.expected_outcome as string) || 'Monitor leaf spread and follow recommended agricultural care.',
              `${analysis.affectedAreaPct}% affected leaf area measured on upload.`,
            ]
          );
        }

        const [savedRes, savedImgsRes, savedSoilRes] = await Promise.all([
          client.query('SELECT * FROM predictions WHERE id = $1', [predictionId]),
          client.query('SELECT * FROM screening_images WHERE prediction_id = $1 ORDER BY id ASC', [predictionId]),
          client.query('SELECT * FROM soil_records WHERE prediction_id = $1', [predictionId]),
        ]);

        return {
          plantId: finalPlantId,
          saved: savedRes.rows[0],
          savedImages: savedImgsRes.rows,
          savedSoil: savedSoilRes.rows[0] || null,
          passport,
          progression,
        };
      });

      return res.json({
        suitable: true,
        plantId: txResult.plantId,
        prediction: txResult.saved,
        analysis,
        screeningImages: txResult.savedImages,
        soilRecord: txResult.savedSoil,
        soilAnalysis,
        combinedRecommendations,
        guidance: libraryEntry || null,
        weatherRisk,
        weatherError,
        passport: txResult.passport,
        progression: txResult.progression,
      });
    } catch (err) {
      await Promise.all(uploadedUrlsForCleanup.map((u) => removeStoredImage(u)));
      if (err instanceof DatabaseNotConfiguredError) {
        return res.status(503).json({ error: err.message });
      }
      console.error('Analyze error:', err);
      return res.status(500).json({ error: 'Unable to complete image analysis cleanly. Please retry with a clear leaf photo.' });
    }
  })
);

// Post-screening Farmer Confirmation / Feedback loop (strictly owner-verified)
app.post(
  '/api/predictions/:id/feedback',
  asyncHandler(async (req, res) => {
    const user = await requireAuth(req, res);
    if (!user) return;

    const id = Number(req.params.id);
    const existing = await queryOne<{ id: number; user_id: number | null }>(
      'SELECT id, user_id FROM predictions WHERE id = $1',
      [id]
    );
    if (!existing) {
      return res.status(404).json({ error: 'Screening record not found.' });
    }
    if (existing.user_id !== user.id) {
      return res.status(403).json({ error: 'Access denied. You can only review your own screenings.' });
    }

    const { feedbackStatus, samePlantConfirmed, notes = '' } = req.body as {
      feedbackStatus?: 'confirmed' | 'incorrect' | 'recheck_requested';
      samePlantConfirmed?: boolean | null;
      notes?: string;
    };

    if (!feedbackStatus || !['confirmed', 'incorrect', 'recheck_requested'].includes(feedbackStatus)) {
      return res.status(400).json({ error: 'Valid feedbackStatus (confirmed, incorrect, recheck_requested) is required.' });
    }

    const samePlantVal = typeof samePlantConfirmed === 'boolean' ? (samePlantConfirmed ? 1 : 0) : null;

    await execute(
      `UPDATE predictions
       SET user_feedback_status = $1, user_feedback_notes = $2, same_plant_confirmed = COALESCE($3::integer, same_plant_confirmed)
       WHERE id = $4 AND user_id = $5`,
      [feedbackStatus, String(notes || '').trim(), samePlantVal, id, user.id]
    );

    const updated = await queryOne('SELECT * FROM predictions WHERE id = $1', [id]);
    return res.json({ ok: true, prediction: updated });
  })
);

// Field Passport endpoints (strict owner check OR enabled public share_token)
app.get(
  '/api/passports/:code',
  asyncHandler(async (req, res) => {
    const code = String(req.params.code || '').trim();
    const shareToken = String(req.query.token || '').trim();

    const passport = await queryOne<{
      id: number;
      passport_code: string;
      prediction_id: number;
      weather_record_id: number | null;
      share_token: string;
      is_public_share: number;
      qr_payload: string;
      created_at: string;
    }>('SELECT * FROM field_passports WHERE passport_code = $1', [code]);

    if (!passport) {
      return res.status(404).json({ error: 'Field Passport not found.' });
    }

    const prediction = await queryOne<{
      id: number;
      user_id: number | null;
      plant_id: number | null;
      crop: string;
      predicted_disease: string;
      verified_crop: string | null;
      verified_disease: string | null;
      region_label: string;
      [key: string]: unknown;
    }>('SELECT * FROM predictions WHERE id = $1', [passport.prediction_id]);

    if (!prediction) return res.status(404).json({ error: 'Linked screening not found.' });

    const authUser = await getAuthUser(req);
    const isOwner = Boolean(authUser && prediction.user_id === authUser.id);
    const isPublicValid = Boolean(shareToken && passport.is_public_share === 1 && shareToken === passport.share_token);

    if (!isOwner && !isPublicValid) {
      if (!authUser && !shareToken) {
        return res.status(401).json({ error: 'Please sign in to view your Field Passport.' });
      }
      return res.status(403).json({
        error: 'This Field Passport is private or the sharing token is invalid. Ask the owner to enable QR sharing.',
      });
    }

    const effectiveCrop = prediction.verified_crop || prediction.crop;
    const effectiveDisease = prediction.verified_disease || prediction.predicted_disease;

    const [guidance, weather, severity, screeningImages, soilRecord] = await Promise.all([
      queryOne('SELECT * FROM disease_library WHERE LOWER(crop) = LOWER($1) AND LOWER(disease_name) = LOWER($2)', [
        effectiveCrop,
        effectiveDisease,
      ]),
      passport.weather_record_id
        ? queryOne('SELECT * FROM weather_records WHERE id = $1', [passport.weather_record_id])
        : Promise.resolve(null),
      queryOne('SELECT * FROM severity_analyses WHERE prediction_id = $1', [passport.prediction_id]),
      query('SELECT * FROM screening_images WHERE prediction_id = $1 ORDER BY id ASC', [passport.prediction_id]),
      queryOne('SELECT * FROM soil_records WHERE prediction_id = $1', [passport.prediction_id]),
    ]);

    let historicalComparison: unknown[] = [];
    let treatments: unknown[] = [];
    if (prediction.plant_id) {
      [historicalComparison, treatments] = await Promise.all([
        query(
          `SELECT id, affected_area_pct, severity, created_at
           FROM predictions WHERE plant_id = $1 ORDER BY created_at ASC, id ASC`,
          [prediction.plant_id]
        ),
        query(
          `SELECT id, medicine_name, active_ingredient, dosage_applied, application_date, days_used
           FROM treatment_records WHERE plant_id = $1 ORDER BY application_date DESC, id DESC LIMIT 5`,
          [prediction.plant_id]
        ),
      ]);
    }

    const safePrediction = isOwner
      ? prediction
      : {
          ...prediction,
          user_id: undefined,
          notes: '',
          user_feedback_notes: '',
        };

    const safePassport = isOwner
      ? passport
      : {
          ...passport,
          share_token: shareToken,
        };

    return res.json({
      isOwner,
      passport: safePassport,
      prediction: safePrediction,
      severity: severity || null,
      guidance: guidance || null,
      weather: weather || null,
      screeningImages,
      soilRecord: soilRecord || null,
      treatments,
      historicalComparison,
    });
  })
);

app.patch(
  '/api/passports/:code/share',
  asyncHandler(async (req, res) => {
    const user = await requireAuth(req, res);
    if (!user) return;

    const code = String(req.params.code || '').trim();
    const { enabled } = req.body as { enabled?: boolean };
    const row = await queryOne<{ id: number; owner_id: number | null }>(
      `SELECT fp.id, p.user_id AS owner_id
       FROM field_passports fp
       JOIN predictions p ON p.id = fp.prediction_id
       WHERE fp.passport_code = $1`,
      [code]
    );

    if (!row) return res.status(404).json({ error: 'Field Passport not found.' });
    if (row.owner_id !== user.id) {
      return res.status(403).json({ error: 'Access denied. Only the passport owner can toggle sharing.' });
    }

    await execute('UPDATE field_passports SET is_public_share = $1 WHERE id = $2', [enabled ? 1 : 0, row.id]);
    const updated = await queryOne('SELECT * FROM field_passports WHERE id = $1', [row.id]);
    return res.json({ passport: updated });
  })
);

// User-Isolated Plants & Disease Progression Intelligence Endpoints
app.get(
  '/api/plants',
  asyncHandler(async (req, res) => {
    const user = await requireAuth(req, res);
    if (!user) return;

    const rows = await query(
      `SELECT p.*,
        (SELECT COUNT(*)::int FROM predictions pr WHERE pr.plant_id = p.id AND pr.user_id = $1) AS scan_count,
        (SELECT affected_area_pct FROM predictions pr WHERE pr.plant_id = p.id AND pr.user_id = $1 ORDER BY pr.created_at DESC, pr.id DESC LIMIT 1) AS latest_affected_pct,
        (SELECT severity FROM predictions pr WHERE pr.plant_id = p.id AND pr.user_id = $1 ORDER BY pr.created_at DESC, pr.id DESC LIMIT 1) AS latest_severity,
        (SELECT COALESCE(verified_disease, predicted_disease) FROM predictions pr WHERE pr.plant_id = p.id AND pr.user_id = $1 ORDER BY pr.created_at DESC, pr.id DESC LIMIT 1) AS latest_disease,
        (SELECT confidence FROM predictions pr WHERE pr.plant_id = p.id AND pr.user_id = $1 ORDER BY pr.created_at DESC, pr.id DESC LIMIT 1) AS latest_confidence,
        (SELECT verification_status FROM predictions pr WHERE pr.plant_id = p.id AND pr.user_id = $1 ORDER BY pr.created_at DESC, pr.id DESC LIMIT 1) AS latest_verification_status
       FROM plants p
       WHERE p.owner_id = $1
       ORDER BY p.created_at DESC, p.id DESC`,
      [user.id]
    );

    return res.json({ plants: rows });
  })
);

app.post(
  '/api/plants',
  asyncHandler(async (req, res) => {
    const user = await requireAuth(req, res);
    if (!user) return;

    const { plantCode, crop, fieldLabel, regionLabel = '' } = req.body as {
      plantCode?: string;
      crop?: string;
      fieldLabel?: string;
      regionLabel?: string;
    };
    if (!crop?.trim() || !fieldLabel?.trim()) {
      return res.status(400).json({ error: 'Crop and field label are required.' });
    }
    const code = (plantCode && plantCode.trim()) || `PLT-${crop.slice(0, 3).toUpperCase()}-${Date.now().toString().slice(-5)}`;
    try {
      const created = await queryOne(
        'INSERT INTO plants (plant_code, crop, field_label, region_label, owner_id, is_demo) VALUES ($1, $2, $3, $4, $5, 0) RETURNING *',
        [code, crop.trim(), fieldLabel.trim(), regionLabel.trim() || user.region || '', user.id]
      );
      return res.status(201).json({ plant: created });
    } catch (err) {
      return res.status(400).json({ error: err instanceof Error ? err.message : 'Could not create plant record' });
    }
  })
);

app.get(
  '/api/plants/:id/progression',
  asyncHandler(async (req, res) => {
    const user = await requireAuth(req, res);
    if (!user) return;

    const plantId = Number(req.params.id);
    const plant = await queryOne<{ id: number; owner_id: number | null; crop: string; [key: string]: unknown }>(
      'SELECT * FROM plants WHERE id = $1',
      [plantId]
    );
    if (!plant) return res.status(404).json({ error: 'Plant record not found.' });
    if (plant.owner_id !== user.id) {
      return res.status(403).json({ error: 'Access denied. You do not own this plant record.' });
    }

    const scans = await query<{
      id: number;
      crop: string;
      predicted_disease: string;
      verified_crop?: string | null;
      verified_disease?: string | null;
      uncertain: number;
      affected_area_pct: number;
      weather_record_id?: number | null;
      created_at: string;
      [key: string]: unknown;
    }>(
      `SELECT p.*, fp.passport_code
       FROM predictions p
       LEFT JOIN field_passports fp ON fp.prediction_id = p.id
       WHERE p.plant_id = $1 AND p.user_id = $2
       ORDER BY p.created_at ASC, p.id ASC`,
      [plantId, user.id]
    );

    let overallTrend: 'Improving' | 'Spreading' | 'Relatively Unchanged' | 'Insufficient Data' = 'Insufficient Data';
    let netChangePct = 0;

    if (scans.length >= 2) {
      const prev = scans[scans.length - 2].affected_area_pct;
      const curr = scans[scans.length - 1].affected_area_pct;
      netChangePct = Number((curr - prev).toFixed(2));
      if (netChangePct <= -2.0) overallTrend = 'Improving';
      else if (netChangePct >= 2.0) overallTrend = 'Spreading';
      else overallTrend = 'Relatively Unchanged';
    }

    const latestScan = scans.length > 0 ? scans[scans.length - 1] : null;
    const effectiveCrop = latestScan ? latestScan.verified_crop || latestScan.crop : plant.crop;
    const effectiveDisease = latestScan ? latestScan.verified_disease || latestScan.predicted_disease : '';

    const [guidance, latestWeather, treatments, timeline] = await Promise.all([
      effectiveDisease
        ? queryOne('SELECT * FROM disease_library WHERE LOWER(crop) = LOWER($1) AND LOWER(disease_name) = LOWER($2)', [
            effectiveCrop,
            effectiveDisease,
          ])
        : Promise.resolve(null),
      latestScan?.weather_record_id
        ? queryOne('SELECT * FROM weather_records WHERE id = $1', [latestScan.weather_record_id])
        : queryOne('SELECT * FROM weather_records WHERE user_id = $1 ORDER BY recorded_at DESC, id DESC LIMIT 1', [
            user.id,
          ]),
      query('SELECT * FROM treatment_records WHERE plant_id = $1 AND user_id = $2 ORDER BY application_date DESC, id DESC', [
        plantId,
        user.id,
      ]),
      query('SELECT * FROM progression_entries WHERE plant_id = $1 AND user_id = $2 ORDER BY day_number ASC, id ASC', [
        plantId,
        user.id,
      ]),
    ]);

    return res.json({
      plant,
      scans,
      overallTrend,
      netChangePct,
      guidance: guidance || null,
      latestWeather: latestWeather || null,
      treatments,
      timeline,
    });
  })
);

// Record Treatment / Pesticide Application under Plant Record
app.post(
  '/api/plants/:id/treatments',
  asyncHandler(async (req, res) => {
    const user = await requireAuth(req, res);
    if (!user) return;

    const plantId = Number(req.params.id);
    const plant = await queryOne<{ id: number; owner_id: number | null }>(
      'SELECT id, owner_id FROM plants WHERE id = $1',
      [plantId]
    );
    if (!plant) return res.status(404).json({ error: 'Plant record not found.' });
    if (plant.owner_id !== user.id) return res.status(403).json({ error: 'Access denied.' });

    const {
      predictionId = null,
      medicineName,
      activeIngredient = '',
      dosageApplied = '',
      applicationDate,
      daysUsed = 1,
      observations = '',
      notes = '',
    } = req.body as {
      predictionId?: number | null;
      medicineName?: string;
      activeIngredient?: string;
      dosageApplied?: string;
      applicationDate?: string;
      daysUsed?: number;
      observations?: string;
      notes?: string;
    };

    if (!medicineName?.trim() || !applicationDate?.trim()) {
      return res.status(400).json({ error: 'Medicine/pesticide name and application date are required.' });
    }

    const created = await withTransaction(async (client) => {
      const ins = await client.query(
        `INSERT INTO treatment_records (
          plant_id, prediction_id, user_id, medicine_name, active_ingredient, dosage_applied,
          application_date, days_used, observations, notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *`,
        [
          plantId,
          predictionId ? Number(predictionId) : null,
          user.id,
          medicineName.trim(),
          activeIngredient.trim(),
          dosageApplied.trim(),
          applicationDate.trim(),
          Math.max(1, Math.min(365, Number(daysUsed) || 1)),
          observations.trim(),
          notes.trim(),
        ]
      );

      const firstRes = await client.query<{ created_at: string }>(
        'SELECT created_at FROM predictions WHERE plant_id = $1 AND user_id = $2 ORDER BY created_at ASC, id ASC LIMIT 1',
        [plantId, user.id]
      );
      const firstScan = firstRes.rows[0];
      let dayNumber = 1;
      if (firstScan) {
        const startMs = new Date(firstScan.created_at.slice(0, 10)).getTime();
        const appMs = new Date(applicationDate.trim()).getTime();
        if (!Number.isNaN(startMs) && !Number.isNaN(appMs)) {
          dayNumber = Math.max(1, Math.round((appMs - startMs) / (1000 * 60 * 60 * 24)) + 1);
        }
      }

      await client.query(
        `INSERT INTO progression_entries (
          plant_id, prediction_id, user_id, day_number, treatment_status, medicine_applied,
          application_date, observed_symptoms, disease_progression, expected_outcome, actual_outcome
        ) VALUES ($1, $2, $3, $4, 'Ongoing', $5, $6, $7, 'Treatment Logged', 'Expected lesion stabilization within 5–7 days', $8)`,
        [
          plantId,
          predictionId ? Number(predictionId) : null,
          user.id,
          dayNumber,
          `${medicineName.trim()}${dosageApplied.trim() ? ` (${dosageApplied.trim()})` : ''}`,
          applicationDate.trim(),
          observations.trim() || 'Treatment applied as recorded.',
          notes.trim() || `Applied for ${Math.max(1, Number(daysUsed) || 1)} day(s).`,
        ]
      );

      return ins.rows[0];
    });

    return res.status(201).json({ treatment: created });
  })
);

// Day-by-Day Progress Tracker Create / Update
app.post(
  '/api/plants/:id/progression-entries',
  asyncHandler(async (req, res) => {
    const user = await requireAuth(req, res);
    if (!user) return;

    const plantId = Number(req.params.id);
    const plant = await queryOne<{ id: number; owner_id: number | null }>(
      'SELECT id, owner_id FROM plants WHERE id = $1',
      [plantId]
    );
    if (!plant) return res.status(404).json({ error: 'Plant record not found.' });
    if (plant.owner_id !== user.id) return res.status(403).json({ error: 'Access denied.' });

    const {
      dayNumber = 1,
      treatmentStatus = 'Ongoing',
      medicineApplied = '',
      applicationDate = new Date().toISOString().slice(0, 10),
      observedSymptoms = '',
      diseaseProgression = 'Observation Logged',
      expectedOutcome = '',
      actualOutcome = '',
    } = req.body as {
      dayNumber?: number;
      treatmentStatus?: 'Planned' | 'Ongoing' | 'Completed' | 'Paused';
      medicineApplied?: string;
      applicationDate?: string;
      observedSymptoms?: string;
      diseaseProgression?: string;
      expectedOutcome?: string;
      actualOutcome?: string;
    };

    if (!['Planned', 'Ongoing', 'Completed', 'Paused'].includes(treatmentStatus)) {
      return res.status(400).json({ error: 'Invalid treatment status.' });
    }

    const entry = await queryOne(
      `INSERT INTO progression_entries (
        plant_id, user_id, day_number, treatment_status, medicine_applied, application_date,
        observed_symptoms, disease_progression, expected_outcome, actual_outcome
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *`,
      [
        plantId,
        user.id,
        Math.max(1, Number(dayNumber) || 1),
        treatmentStatus,
        medicineApplied.trim(),
        applicationDate.trim(),
        observedSymptoms.trim(),
        diseaseProgression.trim(),
        expectedOutcome.trim(),
        actualOutcome.trim(),
      ]
    );

    return res.status(201).json({ entry });
  })
);

app.patch(
  '/api/plants/:id/progression-entries/:entryId',
  asyncHandler(async (req, res) => {
    const user = await requireAuth(req, res);
    if (!user) return;

    const plantId = Number(req.params.id);
    const entryId = Number(req.params.entryId);
    const entry = await queryOne<{ id: number; user_id: number }>(
      'SELECT id, user_id FROM progression_entries WHERE id = $1 AND plant_id = $2',
      [entryId, plantId]
    );
    if (!entry) return res.status(404).json({ error: 'Progression entry not found.' });
    if (entry.user_id !== user.id) return res.status(403).json({ error: 'Access denied.' });

    const { treatmentStatus, observedSymptoms, actualOutcome, medicineApplied } = req.body as {
      treatmentStatus?: 'Planned' | 'Ongoing' | 'Completed' | 'Paused';
      observedSymptoms?: string;
      actualOutcome?: string;
      medicineApplied?: string;
    };

    if (treatmentStatus && !['Planned', 'Ongoing', 'Completed', 'Paused'].includes(treatmentStatus)) {
      return res.status(400).json({ error: 'Invalid treatment status.' });
    }

    const updated = await queryOne(
      `UPDATE progression_entries
       SET treatment_status = COALESCE($1::text, treatment_status),
           observed_symptoms = COALESCE($2::text, observed_symptoms),
           actual_outcome = COALESCE($3::text, actual_outcome),
           medicine_applied = COALESCE($4::text, medicine_applied),
           updated_at = NOW()
       WHERE id = $5 AND user_id = $6
       RETURNING *`,
      [
        treatmentStatus || null,
        typeof observedSymptoms === 'string' ? observedSymptoms.trim() : null,
        typeof actualOutcome === 'string' ? actualOutcome.trim() : null,
        typeof medicineApplied === 'string' ? medicineApplied.trim() : null,
        entryId,
        user.id,
      ]
    );

    return res.json({ entry: updated });
  })
);

// AI-Projected Recovery Illustration check
app.post(
  '/api/plants/:id/recovery-projection',
  asyncHandler(async (req, res) => {
    const user = await requireAuth(req, res);
    if (!user) return;

    const plantId = Number(req.params.id);
    const plant = await queryOne<{ id: number; owner_id: number | null; crop: string }>(
      'SELECT id, owner_id, crop FROM plants WHERE id = $1',
      [plantId]
    );
    if (!plant) return res.status(404).json({ error: 'Plant record not found.' });
    if (plant.owner_id !== user.id) return res.status(403).json({ error: 'Access denied.' });

    const latestScan = await queryOne<{
      id: number;
      crop: string;
      predicted_disease: string;
      verified_crop: string | null;
      verified_disease: string | null;
      uncertain: number;
      severity: string;
      affected_area_pct: number;
    }>(
      `SELECT id, crop, predicted_disease, verified_crop, verified_disease, uncertain, severity, affected_area_pct
       FROM predictions
       WHERE plant_id = $1 AND user_id = $2
       ORDER BY created_at DESC, id DESC LIMIT 1`,
      [plantId, user.id]
    );

    if (!latestScan) {
      return res.json({
        available: false,
        uncertain: false,
        reason: 'Upload and analyze at least one plant photograph first.',
      });
    }

    const effectiveDisease = latestScan.verified_disease || latestScan.predicted_disease;
    if (effectiveDisease === 'Healthy') {
      return res.json({
        available: false,
        uncertain: false,
        reason: 'This plant is healthy and does not require a recovery projection.',
      });
    }

    return res.json({
      available: false,
      uncertain: latestScan.uncertain === 1,
      diagnosedContext: `${latestScan.verified_crop || latestScan.crop} — ${effectiveDisease} (${latestScan.severity}, ${latestScan.affected_area_pct}% area)`,
      reason: 'Use Follow-Up Image Comparison below to track real visual recovery over time.',
    });
  })
);

// User-Isolated Prediction History
app.get(
  '/api/predictions',
  asyncHandler(async (req, res) => {
    const user = await requireAuth(req, res);
    if (!user) return;

    const search = String(req.query.search || '').trim().toLowerCase();
    const crop = String(req.query.crop || '').trim();
    const severity = String(req.query.severity || '').trim();
    const status = String(req.query.status || '').trim();
    const sort = String(req.query.sort || 'newest');

    let sql = `SELECT p.*, pl.plant_code, pl.field_label, fp.passport_code
               FROM predictions p
               LEFT JOIN plants pl ON pl.id = p.plant_id
               LEFT JOIN field_passports fp ON fp.prediction_id = p.id
               WHERE p.user_id = $1`;
    const params: Array<string | number> = [user.id];

    if (crop && crop !== 'All') {
      params.push(crop);
      sql += ` AND LOWER(COALESCE(p.verified_crop, p.crop)) = LOWER($${params.length})`;
    }
    if (severity && severity !== 'All') {
      params.push(severity);
      sql += ` AND p.severity = $${params.length}`;
    }
    if (status && status !== 'All') {
      params.push(status);
      sql += ` AND p.verification_status = $${params.length}`;
    }
    if (search) {
      const like = `%${search}%`;
      params.push(like);
      const pLike = params.length;
      params.push(search);
      const pExact = params.length;
      sql += ` AND (LOWER(p.crop) LIKE $${pLike} OR LOWER(p.predicted_disease) LIKE $${pLike} OR LOWER(COALESCE(p.verified_disease,'')) LIKE $${pLike} OR LOWER(p.region_label) LIKE $${pLike} OR CAST(p.id AS TEXT) = $${pExact})`;
    }

    if (sort === 'oldest') sql += ' ORDER BY p.created_at ASC, p.id ASC';
    else if (sort === 'severity_desc') sql += ' ORDER BY p.affected_area_pct DESC';
    else if (sort === 'confidence_desc') sql += ' ORDER BY p.confidence DESC';
    else sql += ' ORDER BY p.created_at DESC, p.id DESC';

    const rows = await query(sql, params);
    return res.json({ predictions: rows });
  })
);

app.get(
  '/api/predictions/:id',
  asyncHandler(async (req, res) => {
    const user = await requireAuth(req, res);
    if (!user) return;

    const id = Number(req.params.id);
    const row = await queryOne<{
      id: number;
      user_id: number | null;
      crop: string;
      predicted_disease: string;
      verified_crop?: string;
      verified_disease?: string;
      weather_record_id?: number | null;
      plant_id?: number | null;
    }>(
      `SELECT p.*, fp.passport_code
       FROM predictions p
       LEFT JOIN field_passports fp ON fp.prediction_id = p.id
       WHERE p.id = $1`,
      [id]
    );
    if (!row) return res.status(404).json({ error: 'Prediction not found' });
    if (row.user_id !== user.id) {
      return res.status(403).json({ error: 'Access denied. You do not own this screening record.' });
    }

    const effectiveCrop = row.verified_crop || row.crop;
    const effectiveDisease = row.verified_disease || row.predicted_disease;

    const [guidance, weather, passport, severityDetail, screeningImages, soilRecord, corrections] = await Promise.all([
      queryOne('SELECT * FROM disease_library WHERE LOWER(crop) = LOWER($1) AND LOWER(disease_name) = LOWER($2)', [
        effectiveCrop,
        effectiveDisease,
      ]),
      row.weather_record_id
        ? queryOne('SELECT * FROM weather_records WHERE id = $1', [row.weather_record_id])
        : Promise.resolve(null),
      queryOne('SELECT * FROM field_passports WHERE prediction_id = $1', [id]),
      queryOne('SELECT * FROM severity_analyses WHERE prediction_id = $1', [id]),
      query('SELECT * FROM screening_images WHERE prediction_id = $1 ORDER BY id ASC', [id]),
      queryOne('SELECT * FROM soil_records WHERE prediction_id = $1', [id]),
      query(
        `SELECT id, prediction_id, reviewer_name, action, original_crop, original_disease, corrected_crop, corrected_disease, comments, created_at
         FROM expert_corrections WHERE prediction_id = $1 ORDER BY id DESC`,
        [id]
      ),
    ]);

    return res.json({
      prediction: row,
      guidance: guidance || null,
      weather: weather || null,
      passport: passport || null,
      severityDetail: severityDetail || null,
      screeningImages,
      soilRecord: soilRecord || null,
      corrections,
    });
  })
);

app.delete(
  '/api/predictions/:id',
  asyncHandler(async (req, res) => {
    const user = await requireAuth(req, res);
    if (!user) return;

    const id = Number(req.params.id);
    const existing = await queryOne<{
      id: number;
      user_id: number | null;
      original_image_path: string;
      processed_image_path: string;
    }>('SELECT id, user_id, original_image_path, processed_image_path FROM predictions WHERE id = $1', [id]);
    if (!existing) return res.status(404).json({ error: 'Record not found.' });
    if (existing.user_id !== user.id) {
      return res.status(403).json({ error: 'Access denied. You can only delete your own records.' });
    }

    const [imgs, soil] = await Promise.all([
      query<{ original_path: string; processed_path: string }>(
        'SELECT original_path, processed_path FROM screening_images WHERE prediction_id = $1',
        [id]
      ),
      queryOne<{ soil_photo_path: string }>('SELECT soil_photo_path FROM soil_records WHERE prediction_id = $1', [id]),
    ]);

    await withTransaction(async (client) => {
      await client.query('DELETE FROM geographical_reports WHERE prediction_id = $1', [id]);
      await client.query('DELETE FROM expert_corrections WHERE prediction_id = $1', [id]);
      await client.query('DELETE FROM predictions WHERE id = $1 AND user_id = $2', [id, user.id]);
    });

    const cleanupTargets = [
      existing.original_image_path,
      existing.processed_image_path,
      ...imgs.flatMap((img) => [img.original_path, img.processed_path]),
      ...(soil?.soil_photo_path ? [soil.soil_photo_path] : []),
    ].filter(Boolean);

    await Promise.all(cleanupTargets.map((t) => removeStoredImage(t)));

    return res.json({ ok: true });
  })
);

// Environmental Disease Risk (Open-Meteo live data)
app.get(
  '/api/weather/risk',
  asyncHandler(async (req, res) => {
    try {
      const user = await getAuthUser(req);
      const location = String(req.query.location || '').trim();
      const crop = String(req.query.crop || 'Tomato').trim();
      const latParam = req.query.lat ? Number(req.query.lat) : null;
      const lngParam = req.query.lng ? Number(req.query.lng) : null;
      const predictionIdParam = req.query.predictionId ? Number(req.query.predictionId) : null;

      if (predictionIdParam) {
        if (!user) return res.status(401).json({ error: 'Authentication required to attach weather to a screening.' });
        const owned = await queryOne<{ user_id: number | null }>('SELECT user_id FROM predictions WHERE id = $1', [
          predictionIdParam,
        ]);
        if (!owned) return res.status(404).json({ error: 'Prediction not found.' });
        if (owned.user_id !== user.id) return res.status(403).json({ error: 'Access denied.' });
      }

      let resolvedName = location;
      let lat = latParam;
      let lng = lngParam;

      if (lat === null || lng === null || Number.isNaN(lat) || Number.isNaN(lng)) {
        if (!location) {
          return res.status(400).json({ error: 'Provide a city/district name or enable browser location.' });
        }
        const geo = await geocodeLocation(location);
        if (!geo) {
          return res.status(404).json({ error: `Location "${location}" could not be found.` });
        }
        resolvedName = geo.name;
        lat = geo.latitude;
        lng = geo.longitude;
      } else if (!resolvedName) {
        resolvedName = await reverseGeocodeLabel(lat, lng);
      }

      const result = await fetchOpenMeteoRisk(resolvedName, lat, lng, crop);

      let weatherId: number | undefined;
      if (user && isDatabaseConfigured()) {
        const wRes = await queryOne<{ id: number }>(
          `INSERT INTO weather_records (user_id, location_name, latitude, longitude, crop, temperature_c, humidity_pct, rainfall_mm, risk_level, risk_factors_json, time_period, is_demo)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 0)
           RETURNING id`,
          [
            user.id,
            result.locationName,
            result.latitude,
            result.longitude,
            result.crop,
            result.temperatureC,
            result.humidityPct,
            result.rainfallMm,
            result.riskLevel,
            JSON.stringify(result.riskFactors),
            result.timePeriod,
          ]
        );

        weatherId = Number(wRes!.id);
        if (predictionIdParam) {
          await execute(
            "UPDATE predictions SET weather_record_id = $1, region_label = COALESCE(NULLIF(region_label, ''), $2) WHERE id = $3 AND user_id = $4",
            [weatherId, result.locationName, predictionIdParam, user.id]
          );
          await execute('UPDATE field_passports SET weather_record_id = $1 WHERE prediction_id = $2', [
            weatherId,
            predictionIdParam,
          ]);
        }
      }

      return res.json({ ...result, weatherRecordId: weatherId });
    } catch (err) {
      return res.status(502).json({ error: err instanceof Error ? err.message : 'Unable to fetch Open-Meteo weather data.' });
    }
  })
);

app.get(
  '/api/weather/history',
  asyncHandler(async (req, res) => {
    const user = await requireAuth(req, res);
    if (!user) return;
    const records = await query(
      'SELECT * FROM weather_records WHERE user_id = $1 ORDER BY recorded_at DESC, id DESC LIMIT 15',
      [user.id]
    );
    return res.json({ records });
  })
);

// Geographical Outbreak Map (Privacy-preserving ~5km aggregated reports)
app.get(
  '/api/outbreaks',
  asyncHandler(async (req, res) => {
    if (!isDatabaseConfigured()) {
      return res.json({ reports: [], clusters: [] });
    }
    const crop = String(req.query.crop || '').trim();
    const disease = String(req.query.disease || '').trim();
    const days = req.query.days ? Number(req.query.days) : 0;
    const verifiedOnly = req.query.verifiedOnly === 'true';

    let sql =
      'SELECT id, prediction_id, crop, disease, severity, region_label, approx_lat, approx_lng, verified, reported_at FROM geographical_reports WHERE 1=1';
    const params: Array<string | number> = [];

    if (crop && crop !== 'All') {
      params.push(crop);
      sql += ` AND LOWER(crop) = LOWER($${params.length})`;
    }
    if (disease && disease !== 'All') {
      params.push(disease);
      sql += ` AND LOWER(disease) = LOWER($${params.length})`;
    }
    if (verifiedOnly) {
      sql += ' AND verified = 1';
    }
    if (days > 0) {
      params.push(days);
      sql += ` AND reported_at >= NOW() - ($${params.length} * INTERVAL '1 day')`;
    }
    sql += ' ORDER BY reported_at DESC';

    const reports = await query<{
      id: number;
      prediction_id: number;
      crop: string;
      disease: string;
      severity: string;
      region_label: string;
      approx_lat: number;
      approx_lng: number;
      verified: number;
      reported_at: string;
    }>(sql, params);

    const clusterMap = new Map<
      string,
      {
        regionLabel: string;
        crop: string;
        disease: string;
        lat: number;
        lng: number;
        count: number;
        verifiedCount: number;
        latestDate: string;
      }
    >();

    for (const r of reports) {
      const key = `${Math.round(r.approx_lat * 5) / 5}_${Math.round(r.approx_lng * 5) / 5}_${r.crop}_${r.disease}`;
      const existing = clusterMap.get(key);
      if (existing) {
        existing.count += 1;
        existing.verifiedCount += r.verified ? 1 : 0;
        if (r.reported_at > existing.latestDate) existing.latestDate = r.reported_at;
      } else {
        clusterMap.set(key, {
          regionLabel: r.region_label,
          crop: r.crop,
          disease: r.disease,
          lat: r.approx_lat,
          lng: r.approx_lng,
          count: 1,
          verifiedCount: r.verified ? 1 : 0,
          latestDate: r.reported_at,
        });
      }
    }

    const clusters = Array.from(clusterMap.values()).sort((a, b) => b.count - a.count);
    return res.json({ reports, clusters });
  })
);

// Expert Verification System (RBAC protected & Privacy scrubbed)
app.get(
  '/api/expert/queue',
  asyncHandler(async (req, res) => {
    const user = await requireExpertOrAdmin(req, res);
    if (!user) return;

    const statusFilter = String(req.query.status || 'pending');
    let sql = `
      SELECT id, crop, predicted_disease, condition_category, confidence, uncertain, uncertainty_reason,
             affected_area_pct, severity, original_image_path, processed_image_path, model_engine,
             verification_status, verified_crop, verified_disease, region_label, symptoms_json,
             user_feedback_status, user_feedback_notes, created_at
      FROM predictions
    `;
    const params: string[] = [];
    if (statusFilter !== 'all') {
      params.push(statusFilter);
      sql += ` WHERE verification_status = $1`;
    }
    sql += ' ORDER BY created_at DESC, id DESC';

    const [queue, corrections] = await Promise.all([
      query(sql, params),
      query('SELECT * FROM expert_corrections ORDER BY created_at DESC, id DESC LIMIT 50'),
    ]);

    return res.json({
      queue,
      corrections,
      reviewer: { id: user.id, name: user.name, role: user.role, region: user.region },
    });
  })
);

app.post(
  '/api/expert/verify',
  asyncHandler(async (req, res) => {
    const user = await requireExpertOrAdmin(req, res);
    if (!user) return;

    const { predictionId, action, correctedCrop, correctedDisease, comments = '' } = req.body as {
      predictionId?: number;
      action?: 'confirm' | 'reject' | 'correct';
      correctedCrop?: string;
      correctedDisease?: string;
      comments?: string;
    };

    if (!predictionId || !action || !['confirm', 'reject', 'correct'].includes(action)) {
      return res.status(400).json({ error: 'Valid predictionId and action (confirm, reject, correct) are required.' });
    }

    const pred = await queryOne<{ id: number; crop: string; predicted_disease: string }>(
      'SELECT id, crop, predicted_disease FROM predictions WHERE id = $1',
      [predictionId]
    );
    if (!pred) {
      return res.status(404).json({ error: 'Prediction not found.' });
    }

    if (action === 'correct' && (!correctedCrop?.trim() || !correctedDisease?.trim())) {
      return res.status(400).json({ error: 'Corrected crop and disease are required when action is correct.' });
    }

    const nextStatus = action === 'confirm' ? 'confirmed' : action === 'reject' ? 'rejected' : 'corrected';
    const finalCrop = action === 'correct' ? correctedCrop!.trim() : pred.crop;
    const finalDisease = action === 'correct' ? correctedDisease!.trim() : pred.predicted_disease;

    await withTransaction(async (client) => {
      await client.query(
        `UPDATE predictions
         SET verification_status = $1, verified_crop = $2, verified_disease = $3
         WHERE id = $4`,
        [nextStatus, action === 'reject' ? null : finalCrop, action === 'reject' ? null : finalDisease, pred.id]
      );

      if (action === 'confirm' || action === 'correct') {
        await client.query(
          `UPDATE geographical_reports
           SET verified = 1, crop = $1, disease = $2
           WHERE prediction_id = $3`,
          [finalCrop, finalDisease, pred.id]
        );
      } else if (action === 'reject') {
        await client.query('DELETE FROM geographical_reports WHERE prediction_id = $1', [pred.id]);
      }

      await client.query(
        `INSERT INTO expert_corrections
          (prediction_id, reviewer_id, reviewer_name, action, original_crop, original_disease, corrected_crop, corrected_disease, comments, queued_for_retraining)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          pred.id,
          user.id,
          user.name,
          action,
          pred.crop,
          pred.predicted_disease,
          action === 'correct' ? finalCrop : null,
          action === 'correct' ? finalDisease : null,
          comments.trim(),
          action === 'reject' ? 0 : 1,
        ]
      );
    });

    await logAudit({ id: user.id, role: user.role }, `expert.verify.${action}`, 'prediction', pred.id, {
      original: `${pred.crop} - ${pred.predicted_disease}`,
      final: action === 'reject' ? 'rejected' : `${finalCrop} - ${finalDisease}`,
      comments: comments.trim(),
    });

    return res.json({ ok: true, status: nextStatus });
  })
);

app.get(
  '/api/evaluations',
  asyncHandler(async (_req, res) => {
    if (!isDatabaseConfigured()) return res.json({ evaluations: [] });
    const evaluations = await query('SELECT * FROM model_evaluations ORDER BY id DESC LIMIT 10');
    return res.json({ evaluations });
  })
);

app.post(
  '/api/evaluations',
  asyncHandler(async (req, res) => {
    const user = await requireExpertOrAdmin(req, res);
    if (!user) return;

    const { modelName, datasetName, accuracy, precisionMacro, recallMacro, f1Macro, confusionMatrix, classes, notes = '' } =
      req.body as {
        modelName?: string;
        datasetName?: string;
        accuracy?: number;
        precisionMacro?: number;
        recallMacro?: number;
        f1Macro?: number;
        confusionMatrix?: number[][];
        classes?: string[];
        notes?: string;
      };

    if (!modelName || !datasetName || typeof accuracy !== 'number' || !Array.isArray(confusionMatrix)) {
      return res.status(400).json({ error: 'Valid evaluation metrics and confusionMatrix array from evaluate.py are required.' });
    }

    const r = await queryOne<{ id: number }>(
      `INSERT INTO model_evaluations
        (model_name, dataset_name, status, accuracy, precision_macro, recall_macro, f1_macro, confusion_matrix_json, classes_json, notes)
       VALUES ($1, $2, 'evaluated', $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        modelName,
        datasetName,
        accuracy,
        precisionMacro ?? null,
        recallMacro ?? null,
        f1Macro ?? null,
        JSON.stringify(confusionMatrix),
        JSON.stringify(classes || []),
        notes,
      ]
    );

    return res.status(201).json({ id: Number(r!.id) });
  })
);

// Admin-only User / Expert Provisioning, Access Control, Audit Logs & PostgreSQL Backups
app.get(
  '/api/admin/users',
  asyncHandler(async (req, res) => {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const users = await query('SELECT id, name, email, role, region, is_active, created_at FROM users ORDER BY id DESC');
    return res.json({ users });
  })
);

app.post(
  '/api/admin/experts',
  asyncHandler(async (req, res) => {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const { name, email, password, region = 'Regional Extension Center', role = 'expert' } = req.body as {
      name?: string;
      email?: string;
      password?: string;
      region?: string;
      role?: 'expert' | 'admin';
    };

    if (!name?.trim() || !email?.trim() || !password || password.length < 6) {
      return res.status(400).json({ error: 'Name, email, and password (min 6 chars) are required.' });
    }
    const normalizedEmail = email.trim().toLowerCase();
    const existing = await queryOne<{ id: number }>('SELECT id FROM users WHERE email = $1', [normalizedEmail]);
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    const targetRole = role === 'admin' ? 'admin' : 'expert';
    const created = await queryOne<{ id: number }>(
      `INSERT INTO users (name, email, password_hash, role, region, preferred_language, is_active)
       VALUES ($1, $2, $3, $4, $5, 'en', 1)
       RETURNING id, name, email, role, region, is_active, created_at`,
      [name.trim(), normalizedEmail, bcrypt.hashSync(password, 10), targetRole, region.trim()]
    );

    const newId = Number(created!.id);
    await logAudit({ id: admin.id, role: 'admin' }, 'admin.create_expert', 'user', newId, {
      email: normalizedEmail,
      role: targetRole,
    });

    return res.status(201).json({ user: created });
  })
);

app.patch(
  '/api/admin/users/:id',
  asyncHandler(async (req, res) => {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const targetId = Number(req.params.id);
    const { isActive, role } = req.body as { isActive?: boolean; role?: 'farmer' | 'expert' | 'admin' };
    const target = await queryOne<{ id: number; role: string; is_active: number }>(
      'SELECT id, role, is_active FROM users WHERE id = $1',
      [targetId]
    );
    if (!target) return res.status(404).json({ error: 'User not found.' });
    if (targetId === admin.id && isActive === false) {
      return res.status(400).json({ error: 'Administrators cannot deactivate their own active account.' });
    }

    const nextActive = typeof isActive === 'boolean' ? (isActive ? 1 : 0) : target.is_active;
    const nextRole = role && ['farmer', 'expert', 'admin'].includes(role) ? role : target.role;

    await execute('UPDATE users SET is_active = $1, role = $2 WHERE id = $3', [nextActive, nextRole, targetId]);
    if (nextActive === 0) {
      await execute('DELETE FROM sessions WHERE user_id = $1', [targetId]);
    }
    await logAudit({ id: admin.id, role: 'admin' }, 'admin.update_user', 'user', targetId, {
      isActive: nextActive,
      role: nextRole,
    });

    const updated = await queryOne(
      'SELECT id, name, email, role, region, is_active, created_at FROM users WHERE id = $1',
      [targetId]
    );
    return res.json({ user: updated });
  })
);

app.get(
  '/api/admin/audit-logs',
  asyncHandler(async (req, res) => {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const logs = await query('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 100');
    return res.json({ logs });
  })
);

app.get(
  '/api/admin/backups',
  asyncHandler(async (req, res) => {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    return res.json({ backups: listDatabaseBackups() });
  })
);

app.post(
  '/api/admin/backup',
  asyncHandler(async (req, res) => {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    try {
      const info = await createDatabaseBackup();
      await logAudit({ id: admin.id, role: 'admin' }, 'admin.create_backup', 'backup', info.filename);
      return res.status(201).json({ backup: info, backups: listDatabaseBackups() });
    } catch {
      return res.status(500).json({ error: 'Backup creation failed.' });
    }
  })
);

app.get(
  '/api/admin/backup/download/:filename',
  asyncHandler(async (req, res) => {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const safeName = path.basename(String(req.params.filename || ''));
    if (!safeName.endsWith('.json')) {
      return res.status(400).json({ error: 'Invalid backup filename.' });
    }
    const fullPath = path.join(BACKUPS_DIR, safeName);
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: 'Backup file not found.' });
    }
    return res.download(fullPath, safeName);
  })
);

// Central async error handler
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof DatabaseNotConfiguredError) {
    return res.status(503).json({ error: err.message });
  }
  console.error('Unhandled server error:', err);
  return res.status(500).json({ error: 'Internal server error.' });
});

async function startServer() {
  try {
    await initDatabase();
  } catch (err) {
    console.error('Database initialization error:', err instanceof Error ? err.message : err);
  }

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`SasyaRaksha running at http://localhost:${PORT}`);
  });

  const shutdown = async (signal: string) => {
    console.log(`Received ${signal}; shutting down SasyaRaksha cleanly...`);
    server.close(async () => {
      await closePool().catch(() => {});
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 5000).unref();
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

void startServer();
