import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';

export const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'agriguard-images';
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const ALLOWED_IMAGE_MIMES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);

const LOCAL_FALLBACK_UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');
const SUBDIR_MAP: Record<string, string> = {
  plants: 'plants',
  soil: 'soil',
  processed: 'processed',
};

let supabaseClient: SupabaseClient | null = null;
let bucketVerified = false;

export function isStorageConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL?.trim() && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());
}

function getSupabaseAdmin(): SupabaseClient | null {
  if (!isStorageConfigured()) return null;
  if (!supabaseClient) {
    supabaseClient = createClient(
      process.env.SUPABASE_URL!.trim(),
      process.env.SUPABASE_SERVICE_ROLE_KEY!.trim(),
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    );
  }
  return supabaseClient;
}

export async function ensureStorageBucket(): Promise<void> {
  if (bucketVerified) return;
  const client = getSupabaseAdmin();
  if (!client) return;

  try {
    const { data, error } = await client.storage.getBucket(STORAGE_BUCKET);
    if (error || !data) {
      await client.storage.createBucket(STORAGE_BUCKET, {
        public: false,
        fileSizeLimit: MAX_IMAGE_BYTES,
        allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
      });
    }
    bucketVerified = true;
  } catch {
    // Non-fatal: bucket may already exist with restricted metadata permissions
  }
}

export function normalizeMimeType(mime: string): string {
  const lower = (mime || '').toLowerCase().trim();
  if (lower === 'image/jpg') return 'image/jpeg';
  if (ALLOWED_IMAGE_MIMES.has(lower)) return lower;
  return 'image/jpeg';
}

export function extractStorageObjectPath(relOrUrl: string): string | null {
  if (!relOrUrl) return null;
  const cleaned = relOrUrl.trim().split('?')[0];
  if (cleaned.startsWith('/api/uploads/')) {
    const parts = cleaned.replace('/api/uploads/', '').split('/').filter(Boolean);
    if (parts.length === 2 && SUBDIR_MAP[parts[0]]) {
      return `${SUBDIR_MAP[parts[0]]}/${path.basename(parts[1])}`;
    }
    if (parts.length === 1) {
      return path.basename(parts[0]);
    }
  }
  if (/^(plants|soil|processed)\/[a-zA-Z0-9._-]+$/.test(cleaned)) {
    return cleaned;
  }
  return null;
}

export function buildApiUploadUrl(subdir: 'plants' | 'soil' | 'processed', filename: string): string {
  return `/api/uploads/${subdir}/${path.basename(filename)}`;
}

export async function uploadImageBuffer(params: {
  subdir: 'plants' | 'soil' | 'processed';
  filename: string;
  buffer: Buffer;
  contentType: string;
}): Promise<{ objectPath: string; apiUrl: string }> {
  const mime = normalizeMimeType(params.contentType);
  if (!ALLOWED_IMAGE_MIMES.has(mime)) {
    throw new Error('Unsupported image MIME type. Only JPG, PNG, and WebP are allowed.');
  }
  if (params.buffer.byteLength > MAX_IMAGE_BYTES) {
    throw new Error('Image exceeds the 10 MB upload limit.');
  }

  const safeFilename = path.basename(params.filename);
  const objectPath = `${params.subdir}/${safeFilename}`;
  const apiUrl = buildApiUploadUrl(params.subdir, safeFilename);

  const client = getSupabaseAdmin();
  if (!client) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Supabase Storage is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
    }
    // Local unconfigured development fallback only
    const targetDir = path.join(LOCAL_FALLBACK_UPLOADS_DIR, params.subdir);
    if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(path.join(targetDir, safeFilename), params.buffer);
    return { objectPath, apiUrl };
  }

  await ensureStorageBucket();
  const { error } = await client.storage.from(STORAGE_BUCKET).upload(objectPath, params.buffer, {
    contentType: mime,
    upsert: false,
    cacheControl: '3600',
  });

  if (error) {
    throw new Error(`Supabase Storage upload failed: ${error.message}`);
  }

  return { objectPath, apiUrl };
}

export async function downloadImageBuffer(
  objectPath: string
): Promise<{ buffer: Buffer; contentType: string } | null> {
  const cleanPath = objectPath.replace(/^\/+/, '');
  const ext = path.extname(cleanPath).toLowerCase();
  const inferredMime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';

  const client = getSupabaseAdmin();
  if (client) {
    const { data, error } = await client.storage.from(STORAGE_BUCKET).download(cleanPath);
    if (!error && data) {
      const arrayBuf = await data.arrayBuffer();
      return {
        buffer: Buffer.from(arrayBuf),
        contentType: data.type || inferredMime,
      };
    }
  }

  // Fallback to local uploads/ if present (helpful during local dev or transition)
  const localPath = path.join(LOCAL_FALLBACK_UPLOADS_DIR, cleanPath);
  if (fs.existsSync(localPath)) {
    return {
      buffer: fs.readFileSync(localPath),
      contentType: inferredMime,
    };
  }

  return null;
}

export async function createSignedStorageUrl(
  objectPath: string,
  expiresInSeconds = 300
): Promise<string | null> {
  const client = getSupabaseAdmin();
  if (!client) return null;
  const cleanPath = objectPath.replace(/^\/+/, '');
  const { data, error } = await client.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(cleanPath, expiresInSeconds);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

export async function removeStoredImage(relOrObjectPath: string): Promise<void> {
  const objectPath = extractStorageObjectPath(relOrObjectPath);
  if (!objectPath) return;

  const client = getSupabaseAdmin();
  if (client) {
    try {
      await client.storage.from(STORAGE_BUCKET).remove([objectPath]);
    } catch {
      // Non-fatal cleanup error
    }
  }

  const localPath = path.join(LOCAL_FALLBACK_UPLOADS_DIR, objectPath);
  if (fs.existsSync(localPath)) {
    try {
      fs.unlinkSync(localPath);
    } catch {
      // ignore
    }
  }
}

export async function checkStorageHealth(): Promise<{
  configured: boolean;
  bucket: string;
  reachable: boolean;
  mode: 'supabase-private' | 'local-dev-fallback' | 'unconfigured';
}> {
  const client = getSupabaseAdmin();
  if (!client) {
    return {
      configured: false,
      bucket: STORAGE_BUCKET,
      reachable: false,
      mode: process.env.NODE_ENV === 'production' ? 'unconfigured' : 'local-dev-fallback',
    };
  }
  try {
    const { data, error } = await client.storage.getBucket(STORAGE_BUCKET);
    return {
      configured: true,
      bucket: STORAGE_BUCKET,
      reachable: Boolean(!error && data),
      mode: 'supabase-private',
    };
  } catch {
    return {
      configured: true,
      bucket: STORAGE_BUCKET,
      reachable: false,
      mode: 'supabase-private',
    };
  }
}
