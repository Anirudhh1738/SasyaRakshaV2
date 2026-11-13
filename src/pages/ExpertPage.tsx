import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'motion/react';
import {
  Check,
  Database,
  Download,
  Eye,
  EyeOff,
  Lock,
  LogOut,
  Mail,
  RefreshCw,
  ShieldCheck,
  Upload,
  UserPlus,
  X,
} from 'lucide-react';
import { PlotlyChart } from '../components/PlotlyChart';
import { SeverityIndicator, VerificationIndicator } from '../components/StatusText';
import { changeAppLanguage } from '../i18n';
import { translateCrop, translateDisease } from '../i18n/domainTranslations';
import { useTheme } from '../theme';
import type {
  AdminUserSummary,
  AuditLogEntry,
  AuthUser,
  ExpertCorrection,
  LanguageCode,
  ModelEvaluationRecord,
  PredictionRecord,
} from '../types';

interface BackupEntry {
  filename: string;
  sizeBytes: number;
  createdAt: string;
}

interface ExpertPageProps {
  authUser: AuthUser | null;
  onAuthChanged: (user: AuthUser | null, token: string) => void;
  onDataUpdated?: () => void;
}

export function ExpertPage({ authUser, onAuthChanged, onDataUpdated }: ExpertPageProps) {
  const { t, i18n } = useTranslation();
  const [theme] = useTheme();
  const lang = (['en', 'hi', 'kn'].includes(i18n.language) ? i18n.language : 'en') as LanguageCode;

  // Separate Expert/Admin Login form state (strictly NO self-registration tab)
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);

  // Workbench Tabs & State
  const [tab, setTab] = useState<'queue' | 'history' | 'evaluation' | 'users' | 'backups'>('queue');
  const [statusFilter, setStatusFilter] = useState('pending');
  const [queue, setQueue] = useState<PredictionRecord[]>([]);
  const [corrections, setCorrections] = useState<ExpertCorrection[]>([]);
  const [evaluations, setEvaluations] = useState<ModelEvaluationRecord[]>([]);
  const [backups, setBackups] = useState<BackupEntry[]>([]);
  const [creatingBackup, setCreatingBackup] = useState(false);

  // Selected review prediction
  const [selectedPred, setSelectedPred] = useState<PredictionRecord | null>(null);
  const [correctedCrop, setCorrectedCrop] = useState('');
  const [correctedDisease, setCorrectedDisease] = useState('');
  const [comments, setComments] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [actionMsg, setActionMsg] = useState('');

  // Admin state
  const [adminUsers, setAdminUsers] = useState<AdminUserSummary[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [newExpertName, setNewExpertName] = useState('');
  const [newExpertEmail, setNewExpertEmail] = useState('');
  const [newExpertPassword, setNewExpertPassword] = useState('');
  const [showNewExpertPw, setShowNewExpertPw] = useState(false);
  const [newExpertRegion, setNewExpertRegion] = useState('');
  const [newExpertRole, setNewExpertRole] = useState<'expert' | 'admin'>('expert');
  const [creatingExpert, setCreatingExpert] = useState(false);

  const isPrivileged = Boolean(authUser && (authUser.role === 'expert' || authUser.role === 'admin'));

  function authHeaders(extra?: Record<string, string>) {
    const token = localStorage.getItem('agriguard_token') || '';
    return {
      ...(extra || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }

  async function loadExpertData(filter = statusFilter) {
    const resp = await fetch(`/api/expert/queue?status=${filter}`, {
      credentials: 'include',
      headers: authHeaders(),
    });
    if (resp.ok) {
      const json = await resp.json();
      setQueue(json.queue || []);
      setCorrections(json.corrections || []);
      if (json.queue?.length > 0) {
        const currentStillExists = selectedPred && json.queue.some((q: PredictionRecord) => q.id === selectedPred.id);
        if (!currentStillExists) {
          const first = json.queue[0] as PredictionRecord;
          setSelectedPred(first);
          setCorrectedCrop(first.verified_crop || first.crop);
          setCorrectedDisease(first.verified_disease || first.predicted_disease);
        }
      } else {
        setSelectedPred(null);
      }
    }

    const evalResp = await fetch('/api/evaluations');
    if (evalResp.ok) {
      const eJson = await evalResp.json();
      setEvaluations(eJson.evaluations || []);
    }
  }

  async function loadAdminData() {
    const [usersResp, logsResp, backupsResp] = await Promise.all([
      fetch('/api/admin/users', { credentials: 'include', headers: authHeaders() }),
      fetch('/api/admin/audit-logs', { credentials: 'include', headers: authHeaders() }),
      fetch('/api/admin/backups', { credentials: 'include', headers: authHeaders() }),
    ]);
    if (usersResp.ok) {
      const uJson = await usersResp.json();
      setAdminUsers(uJson.users || []);
    }
    if (logsResp.ok) {
      const lJson = await logsResp.json();
      setAuditLogs(lJson.logs || []);
    }
    if (backupsResp.ok) {
      const bJson = await backupsResp.json();
      setBackups(bJson.backups || []);
    }
  }

  useEffect(() => {
    if (isPrivileged) {
      loadExpertData(statusFilter);
    } else {
      setQueue([]);
      setCorrections([]);
      setSelectedPred(null);
    }
    if (authUser?.role === 'admin') {
      loadAdminData();
    } else {
      setAdminUsers([]);
      setAuditLogs([]);
      setBackups([]);
    }
  }, [authUser, statusFilter]);

  async function handleExpertLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoggingIn(true);
    setAuthError('');
    try {
      const resp = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, portal: 'expert' }),
      });
      const json = await resp.json();
      if (!resp.ok) {
        setAuthError(json.error || 'Expert sign in failed.');
        return;
      }
      localStorage.setItem('agriguard_token', json.token);
      if (json.user?.preferred_language) {
        await changeAppLanguage(json.user.preferred_language).catch(() => {});
      }
      setPassword('');
      onAuthChanged(json.user, json.token);
    } finally {
      setLoggingIn(false);
    }
  }

  async function handleLogout() {
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include',
      headers: authHeaders(),
    }).catch(() => {});
    localStorage.removeItem('agriguard_token');
    onAuthChanged(null, '');
    setQueue([]);
    setBackups([]);
    setTab('queue');
  }

  async function submitVerification(action: 'confirm' | 'reject' | 'correct') {
    if (!selectedPred) return;
    setSubmitting(true);
    setActionMsg('');
    try {
      const resp = await fetch('/api/expert/verify', {
        method: 'POST',
        credentials: 'include',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          predictionId: selectedPred.id,
          action,
          correctedCrop: action === 'correct' ? correctedCrop : undefined,
          correctedDisease: action === 'correct' ? correctedDisease : undefined,
          comments,
        }),
      });
      const json = await resp.json();
      if (!resp.ok) {
        setActionMsg(json.error || 'Verification failed.');
        return;
      }
      setComments('');
      setActionMsg(`Prediction #${selectedPred.id} marked as ${json.status} and logged.`);
      setSelectedPred(null);
      await loadExpertData(statusFilter);
      if (authUser?.role === 'admin') await loadAdminData();
      onDataUpdated?.();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUploadEvaluationJson(file: File | undefined) {
    if (!file) return;
    const text = await file.text();
    try {
      const parsed = JSON.parse(text);
      const resp = await fetch('/api/evaluations', {
        method: 'POST',
        credentials: 'include',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(parsed),
      });
      if (resp.ok) {
        const evalResp = await fetch('/api/evaluations');
        if (evalResp.ok) {
          const eJson = await evalResp.json();
          setEvaluations(eJson.evaluations || []);
        }
        setActionMsg('Model evaluation JSON imported.');
      }
    } catch {
      setActionMsg('Invalid evaluation JSON file.');
    }
  }

  async function handleCreateExpertAccount(e: React.FormEvent) {
    e.preventDefault();
    setCreatingExpert(true);
    setActionMsg('');
    try {
      const resp = await fetch('/api/admin/experts', {
        method: 'POST',
        credentials: 'include',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          name: newExpertName,
          email: newExpertEmail,
          password: newExpertPassword,
          region: newExpertRegion || 'Regional Extension Center',
          role: newExpertRole,
        }),
      });
      const json = await resp.json();
      if (!resp.ok) {
        setActionMsg(json.error || 'Could not create expert account.');
        return;
      }
      setNewExpertName('');
      setNewExpertEmail('');
      setNewExpertPassword('');
      setNewExpertRegion('');
      setActionMsg(`Provisioned ${json.user.role} account for ${json.user.email}.`);
      await loadAdminData();
    } finally {
      setCreatingExpert(false);
    }
  }

  async function handleToggleUserAccess(u: AdminUserSummary) {
    setActionMsg('');
    const resp = await fetch(`/api/admin/users/${u.id}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ isActive: u.is_active !== 1 }),
    });
    const json = await resp.json();
    if (!resp.ok) {
      setActionMsg(json.error || 'Could not update user status.');
      return;
    }
    setActionMsg(`Updated access status for ${u.email}.`);
    await loadAdminData();
  }

  async function handleCreateBackup() {
    setCreatingBackup(true);
    setActionMsg('');
    try {
      const resp = await fetch('/api/admin/backup', {
        method: 'POST',
        credentials: 'include',
        headers: authHeaders(),
      });
      const json = await resp.json();
      if (!resp.ok) {
        setActionMsg(json.error || 'Backup creation failed.');
        return;
      }
      setBackups(json.backups || []);
      setActionMsg(`SQLite backup saved: ${json.backup?.filename}`);
      await loadAdminData();
    } finally {
      setCreatingBackup(false);
    }
  }

  async function handleDownloadBackup(filename: string) {
    const resp = await fetch(`/api/admin/backup/download/${encodeURIComponent(filename)}`, {
      credentials: 'include',
      headers: authHeaders(),
    });
    if (!resp.ok) {
      setActionMsg('Could not download backup file.');
      return;
    }
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  const latestEval = evaluations[0] || null;
  const parsedMatrix: number[][] = latestEval ? JSON.parse(latestEval.confusion_matrix_json || '[]') : [];
  const parsedClasses: string[] = latestEval ? JSON.parse(latestEval.classes_json || '[]') : [];

  const tabs: Array<{ id: 'queue' | 'history' | 'evaluation' | 'users' | 'backups'; label: string }> = [
    { id: 'queue', label: t('expert.queueTab') },
    { id: 'history', label: `${t('expert.logTab')} (${corrections.length})` },
    { id: 'evaluation', label: t('expert.evalTab') },
  ];
  if (authUser?.role === 'admin') {
    tabs.push({ id: 'users', label: t('expert.adminUsersTab') });
    tabs.push({ id: 'backups', label: t('expert.backupTab') });
  }

  const heatmapLow = theme === 'light' ? '#F6F8F3' : theme === 'dark' ? '#1D172B' : '#091E15';
  const heatmapHigh = theme === 'light' ? '#285C3A' : theme === 'dark' ? '#F97316' : '#F59E0B';

  return (
    <section id="expert-portal" className="bg-sr-canvas text-sr-text py-20 sm:py-24 scroll-mt-16 transition-colors">
      <div className="max-w-[1160px] mx-auto px-5 sm:px-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold tracking-[0.16em] text-sr-accent-ink">
              04 · {t('nav.expert')}
            </p>
            <h2 className="font-editorial mt-2 text-[clamp(1.9rem,3.4vw,2.75rem)] font-semibold leading-[1.1] text-sr-text">
              {t('expert.portalTitle')}
            </h2>
            <p className="mt-2 text-sm text-sr-muted">{t('expert.portalSubtitle')}</p>
          </div>

          {isPrivileged && authUser && (
            <div className="flex items-center gap-3 shrink-0">
              <div className="text-right text-xs">
                <p className="font-semibold text-sr-text">{authUser.name}</p>
                <p className="text-sr-muted uppercase">{authUser.role}</p>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-sr-text border border-sr-border rounded-lg bg-sr-surface-alt hover:bg-sr-accent-soft transition-colors whitespace-nowrap cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>{t('expert.signOut')}</span>
              </button>
            </div>
          )}
        </div>

        {/* Dedicated Expert / Admin Login Gate (NO farmer registration inside Expert Portal) */}
        {!isPrivileged ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.28 }}
              className="lg:col-span-6 p-7 rounded-2xl sr-auth-card space-y-5 relative overflow-hidden"
            >
              <div
                className="pointer-events-none absolute -top-24 -right-24 w-56 h-56 rounded-full blur-3xl opacity-25"
                style={{ background: 'radial-gradient(circle, #F97316 0%, transparent 70%)' }}
                aria-hidden="true"
              />

              <div className="flex items-center gap-3 relative z-10">
                <div className="w-10 h-10 rounded-xl bg-orange-500/15 border border-orange-400/35 text-orange-300 flex items-center justify-center shrink-0">
                  <Lock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[var(--sr-auth-text)]">{t('expert.expertSignInTitle')}</h3>
                  <p className="text-xs text-[var(--sr-auth-muted)]">{t('expert.expertOnlyNote')}</p>
                </div>
              </div>

              {authUser?.role === 'farmer' && (
                <div className="p-3.5 rounded-lg bg-amber-950/50 border border-amber-400/35 text-xs text-amber-200 relative z-10">
                  {t('expert.farmerBlockedNote', { email: authUser.email })}
                </div>
              )}

              <form onSubmit={handleExpertLogin} className="space-y-4 relative z-10">
                <div>
                  <label className="block text-xs font-medium text-[var(--sr-auth-muted)] mb-1.5">
                    {t('expert.email')}
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-[var(--sr-auth-muted)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="expert@sasyaraksha.org"
                      className="w-full pl-9 pr-3 py-2.5 text-sm rounded-lg sr-auth-input"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--sr-auth-muted)] mb-1.5">
                    {t('expert.password')}
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-[var(--sr-auth-muted)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••"
                      className="w-full pl-9 pr-10 py-2.5 text-sm rounded-lg sr-auth-input"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--sr-auth-muted)] hover:text-orange-300 transition-colors cursor-pointer"
                      aria-label="Toggle expert password visibility"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {authError && (
                  <p className="text-xs text-red-300 bg-red-950/50 border border-red-400/35 rounded-lg px-3 py-2">
                    {authError}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={loggingIn}
                  className="w-full py-2.5 px-4 text-sm font-semibold rounded-lg sr-auth-cta cursor-pointer"
                >
                  {loggingIn ? t('common.loading') : t('expert.expertSignInBtn')}
                </button>
              </form>
            </motion.div>

            <div className="lg:col-span-6 p-7 rounded-2xl border border-sr-border bg-sr-surface sr-surface-glass space-y-4">
              <div className="flex items-center gap-2 text-xs font-semibold text-sr-accent-ink">
                <ShieldCheck className="w-4 h-4" />
                <span>{t('expert.rbacNoticeTitle')}</span>
              </div>
              <ul className="space-y-2.5 text-xs text-sr-muted leading-relaxed">
                <li>• {t('expert.rbacPoint1')}</li>
                <li>• {t('expert.rbacPoint2')}</li>
                <li>• {t('expert.rbacPoint3')}</li>
              </ul>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Tabs */}
            <div className="flex flex-wrap items-center gap-2 border-b border-sr-border pb-3">
              {tabs.map((tItem) => (
                <button
                  key={tItem.id}
                  type="button"
                  onClick={() => setTab(tItem.id)}
                  className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                    tab === tItem.id
                      ? 'bg-sr-accent text-sr-accent-text'
                      : 'bg-sr-surface-alt text-sr-muted hover:text-sr-text'
                  }`}
                >
                  {tItem.label}
                </button>
              ))}
            </div>

            {actionMsg && (
              <div className="p-3.5 rounded-lg border border-sr-accent-border bg-sr-accent-soft text-xs font-medium text-sr-accent-ink">
                {actionMsg}
              </div>
            )}

            {/* 1. Expert Review Queue */}
            {tab === 'queue' && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                <div className="lg:col-span-5 p-4 rounded-xl border border-sr-border bg-sr-surface-alt sr-surface-glass space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-sr-text">{t('expert.queueTab')}</h3>
                    <select
                      value={statusFilter}
                      onChange={(e) => {
                        setStatusFilter(e.target.value);
                        setSelectedPred(null);
                      }}
                      className="px-2.5 py-1 text-xs rounded border border-sr-border bg-sr-input text-sr-text"
                    >
                      <option value="pending">Pending Review</option>
                      <option value="all">All Records</option>
                      <option value="confirmed">Confirmed</option>
                      <option value="corrected">Corrected</option>
                      <option value="rejected">Rejected</option>
                    </select>
                  </div>

                  {queue.length === 0 ? (
                    <p className="py-8 text-center text-xs text-sr-muted">No records in this review queue.</p>
                  ) : (
                    <div className="space-y-2 max-h-[480px] overflow-y-auto">
                      {queue.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => {
                            setSelectedPred(item);
                            setCorrectedCrop(item.verified_crop || item.crop);
                            setCorrectedDisease(item.verified_disease || item.predicted_disease);
                          }}
                          className={`w-full text-left p-3 rounded-lg border transition-colors flex items-center gap-3 cursor-pointer ${
                            selectedPred?.id === item.id
                              ? 'border-sr-accent bg-sr-surface'
                              : 'border-sr-border bg-sr-surface/70 hover:bg-sr-surface'
                          }`}
                        >
                          <img
                            src={item.original_image_path}
                            alt={`Screening #${item.id}`}
                            className="w-12 h-12 rounded object-cover border border-sr-border shrink-0"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-mono font-semibold text-sr-text">#{item.id}</span>
                              <span className="font-mono tabular-nums text-sr-muted">{item.confidence}%</span>
                            </div>
                            <p className="text-xs font-medium text-sr-text truncate">
                              {translateCrop(item.crop, lang)} — {translateDisease(item.predicted_disease, lang)}
                            </p>
                            <div className="flex flex-wrap items-center gap-2 mt-0.5">
                              <VerificationIndicator status={item.verification_status} />
                              {item.region_label && (
                                <span className="text-[11px] text-sr-muted truncate">· {item.region_label}</span>
                              )}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="lg:col-span-7">
                  {!selectedPred ? (
                    <div className="p-10 rounded-xl border border-sr-border bg-sr-surface-alt text-center text-sm text-sr-muted">
                      Select a screening from the queue to inspect images and submit verification.
                    </div>
                  ) : (
                    <div className="p-6 rounded-xl border border-sr-border bg-sr-surface sr-surface-glass space-y-5">
                      <div className="flex items-center justify-between border-b border-sr-border pb-3">
                        <div>
                          <p className="text-xs font-mono text-sr-muted">
                            Prediction #{selectedPred.id} · {selectedPred.region_label || 'No location'}
                          </p>
                          <h3 className="text-base font-bold text-sr-text">
                            AI: {translateCrop(selectedPred.crop, lang)} —{' '}
                            {translateDisease(selectedPred.predicted_disease, lang)} ({selectedPred.confidence}%)
                          </h3>
                        </div>
                        <SeverityIndicator severity={selectedPred.severity} />
                      </div>

                      {selectedPred.user_feedback_status && selectedPred.user_feedback_status !== 'unreviewed' && (
                        <div className="p-3 rounded-lg bg-sr-warn-bg border border-sr-warn-border text-xs text-sr-warn">
                          <strong>Farmer Feedback:</strong> {selectedPred.user_feedback_status}
                          {selectedPred.user_feedback_notes ? ` — "${selectedPred.user_feedback_notes}"` : ''}
                        </div>
                      )}

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <img
                          src={selectedPred.original_image_path}
                          alt="Original leaf"
                          className="w-full h-44 object-contain rounded-lg border border-sr-border bg-sr-surface-alt"
                        />
                        <img
                          src={selectedPred.processed_image_path}
                          alt="Lesion mask"
                          className="w-full h-44 object-contain rounded-lg border border-sr-border bg-sr-surface-alt"
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-sr-text mb-1">
                            Verified / Corrected Crop
                          </label>
                          <input
                            type="text"
                            value={correctedCrop}
                            onChange={(e) => setCorrectedCrop(e.target.value)}
                            className="w-full px-3 py-2 text-xs rounded-lg border border-sr-border bg-sr-input text-sr-text"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-sr-text mb-1">
                            Verified / Corrected Disease
                          </label>
                          <input
                            type="text"
                            value={correctedDisease}
                            onChange={(e) => setCorrectedDisease(e.target.value)}
                            className="w-full px-3 py-2 text-xs rounded-lg border border-sr-border bg-sr-input text-sr-text"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-sr-text mb-1">
                          Expert Pathologist Notes
                        </label>
                        <textarea
                          rows={2}
                          value={comments}
                          onChange={(e) => setComments(e.target.value)}
                          placeholder="Record diagnostic observations or dataset curation notes..."
                          className="w-full px-3 py-2 text-xs rounded-lg border border-sr-border bg-sr-input text-sr-text"
                        />
                      </div>

                      <div className="flex flex-wrap gap-2.5 pt-2">
                        <button
                          type="button"
                          onClick={() => submitVerification('confirm')}
                          disabled={submitting}
                          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-sr-accent-text bg-sr-accent rounded-lg hover:bg-sr-accent-hover transition-colors cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Confirm AI Prediction</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => submitVerification('correct')}
                          disabled={submitting}
                          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-sr-accent-ink bg-sr-accent-soft border border-sr-accent-border rounded-lg hover:opacity-90 cursor-pointer"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span>Save Correction</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => submitVerification('reject')}
                          disabled={submitting}
                          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-sr-danger bg-sr-danger-bg border border-sr-danger-border rounded-lg cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                          <span>Reject Screening</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 2. Verification Log */}
            {tab === 'history' && (
              <div className="rounded-xl border border-sr-border bg-sr-surface sr-surface-glass overflow-hidden">
                {corrections.length === 0 ? (
                  <div className="p-8 text-center text-sm text-sr-muted">No verification actions recorded yet.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-sr-surface-alt text-sr-muted border-b border-sr-border">
                        <tr>
                          <th className="py-2.5 px-4">Prediction</th>
                          <th className="py-2.5 px-4">Action</th>
                          <th className="py-2.5 px-4">Original AI Label</th>
                          <th className="py-2.5 px-4">Corrected Label</th>
                          <th className="py-2.5 px-4">Reviewer</th>
                          <th className="py-2.5 px-4">Comments</th>
                          <th className="py-2.5 px-4">{t('common.date')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-sr-border">
                        {corrections.map((c) => (
                          <tr key={c.id}>
                            <td className="py-2.5 px-4 font-mono">#{c.prediction_id}</td>
                            <td className="py-2.5 px-4 font-semibold capitalize">{c.action}</td>
                            <td className="py-2.5 px-4">
                              {c.original_crop} — {c.original_disease}
                            </td>
                            <td className="py-2.5 px-4">
                              {c.corrected_disease ? `${c.corrected_crop} — ${c.corrected_disease}` : '—'}
                            </td>
                            <td className="py-2.5 px-4">{c.reviewer_name}</td>
                            <td className="py-2.5 px-4 text-sr-muted">{c.comments || '—'}</td>
                            <td className="py-2.5 px-4 font-mono tabular-nums text-sr-muted">
                              {c.created_at.slice(0, 16)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* 3. Model Evaluation */}
            {tab === 'evaluation' && (
              <div className="space-y-5">
                <div className="p-5 rounded-xl border border-sr-border bg-sr-surface sr-surface-glass flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div>
                    <h3 className="text-base font-semibold text-sr-text">
                      Model Evaluation Metrics &amp; Confusion Matrix
                    </h3>
                    <p className="text-xs text-sr-muted mt-0.5">
                      Import a validated model evaluation JSON report to inspect accuracy and per-class confusion matrix.
                    </p>
                  </div>
                  <label className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-sr-accent-text bg-sr-accent rounded-lg hover:bg-sr-accent-hover transition-colors cursor-pointer">
                    <Upload className="w-3.5 h-3.5" />
                    <span>Import Report JSON</span>
                    <input
                      type="file"
                      accept="application/json"
                      className="hidden"
                      onChange={(e) => handleUploadEvaluationJson(e.target.files?.[0])}
                    />
                  </label>
                </div>

                {!latestEval ? (
                  <div className="p-8 rounded-xl border border-sr-border bg-sr-surface-alt text-center">
                    <h4 className="text-sm font-semibold text-sr-text">No Evaluation Report Imported</h4>
                    <p className="text-xs text-sr-muted mt-1">
                      Upload an evaluation JSON report above to view validation metrics.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-5">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      {[
                        { label: 'Accuracy', val: `${latestEval.accuracy}%` },
                        { label: 'Macro Precision', val: `${latestEval.precision_macro}%` },
                        { label: 'Macro Recall', val: `${latestEval.recall_macro}%` },
                        { label: 'Macro F1-Score', val: `${latestEval.f1_macro}%` },
                      ].map((m) => (
                        <div key={m.label} className="p-4 rounded-xl border border-sr-border bg-sr-surface sr-surface-glass">
                          <p className="text-xs text-sr-muted">{m.label}</p>
                          <p className="mt-1 text-2xl font-bold font-mono tabular-nums text-sr-text">{m.val}</p>
                        </div>
                      ))}
                    </div>

                    {parsedMatrix.length > 0 && (
                      <div className="p-5 rounded-xl border border-sr-border bg-sr-surface sr-surface-glass">
                        <h4 className="text-sm font-semibold text-sr-text mb-2">
                          Confusion Matrix ({latestEval.model_name} · {latestEval.dataset_name})
                        </h4>
                        <PlotlyChart
                          height={360}
                          data={[
                            {
                              type: 'heatmap',
                              z: parsedMatrix,
                              x: parsedClasses,
                              y: parsedClasses,
                              colorscale: [
                                [0, heatmapLow],
                                [1, heatmapHigh],
                              ],
                            },
                          ]}
                          layout={{
                            margin: { t: 20, r: 20, b: 90, l: 110 },
                            xaxis: { title: { text: 'Predicted Class' } },
                            yaxis: { title: { text: 'True Class' }, autorange: 'reversed' },
                          }}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* 4. Admin-Only: Users & Experts Management */}
            {tab === 'users' && authUser?.role === 'admin' && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                <form
                  onSubmit={handleCreateExpertAccount}
                  className="lg:col-span-5 p-5 rounded-xl border border-sr-border bg-sr-surface-alt sr-surface-glass space-y-3.5 text-xs"
                >
                  <div className="flex items-center gap-2 text-sm font-bold text-sr-text">
                    <UserPlus className="w-4 h-4 text-sr-accent-ink" />
                    <h3>{t('expert.createExpertTitle')}</h3>
                  </div>

                  <div>
                    <label className="block text-sr-muted mb-1">{t('expert.fullName')}</label>
                    <input
                      type="text"
                      required
                      value={newExpertName}
                      onChange={(e) => setNewExpertName(e.target.value)}
                      placeholder="Dr. Kavitha Rao"
                      className="w-full px-3 py-2 rounded-lg border border-sr-border bg-sr-input text-sr-text"
                    />
                  </div>
                  <div>
                    <label className="block text-sr-muted mb-1">{t('expert.email')}</label>
                    <input
                      type="email"
                      required
                      value={newExpertEmail}
                      onChange={(e) => setNewExpertEmail(e.target.value)}
                      placeholder="kavitha@kvk.org"
                      className="w-full px-3 py-2 rounded-lg border border-sr-border bg-sr-input text-sr-text"
                    />
                  </div>
                  <div>
                    <label className="block text-sr-muted mb-1">{t('expert.password')}</label>
                    <div className="relative">
                      <input
                        type={showNewExpertPw ? 'text' : 'password'}
                        required
                        minLength={6}
                        value={newExpertPassword}
                        onChange={(e) => setNewExpertPassword(e.target.value)}
                        placeholder="Minimum 6 characters"
                        className="w-full px-3 py-2 pr-9 rounded-lg border border-sr-border bg-sr-input text-sr-text"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewExpertPw((v) => !v)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-sr-muted hover:text-sr-text cursor-pointer"
                        aria-label="Toggle new expert password visibility"
                      >
                        {showNewExpertPw ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-sr-muted mb-1">{t('expert.region')}</label>
                      <input
                        type="text"
                        value={newExpertRegion}
                        onChange={(e) => setNewExpertRegion(e.target.value)}
                        placeholder="KVK Hubballi"
                        className="w-full px-3 py-2 rounded-lg border border-sr-border bg-sr-input text-sr-text"
                      />
                    </div>
                    <div>
                      <label className="block text-sr-muted mb-1">Role</label>
                      <select
                        value={newExpertRole}
                        onChange={(e) => setNewExpertRole(e.target.value as 'expert' | 'admin')}
                        className="w-full px-3 py-2 rounded-lg border border-sr-border bg-sr-input text-sr-text"
                      >
                        <option value="expert">Expert</option>
                        <option value="admin">Admin</option>
                      </select>
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={creatingExpert}
                    className="w-full py-2.5 px-4 font-semibold text-sr-accent-text bg-sr-accent rounded-lg hover:bg-sr-accent-hover transition-colors cursor-pointer"
                  >
                    {creatingExpert ? t('common.loading') : t('expert.createExpertBtn')}
                  </button>
                </form>

                <div className="lg:col-span-7 rounded-xl border border-sr-border bg-sr-surface sr-surface-glass overflow-hidden">
                  <div className="px-5 py-3.5 border-b border-sr-border">
                    <h3 className="text-sm font-semibold text-sr-text">Registered Accounts</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-sr-surface-alt text-sr-muted border-b border-sr-border">
                        <tr>
                          <th className="py-2.5 px-3">Name &amp; Email</th>
                          <th className="py-2.5 px-3">Role</th>
                          <th className="py-2.5 px-3">{t('common.status')}</th>
                          <th className="py-2.5 px-3 text-right">{t('common.actions')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-sr-border">
                        {adminUsers.map((u) => (
                          <tr key={u.id}>
                            <td className="py-2.5 px-3">
                              <p className="font-medium text-sr-text">{u.name}</p>
                              <p className="text-sr-muted font-mono">{u.email}</p>
                            </td>
                            <td className="py-2.5 px-3 uppercase font-semibold">{u.role}</td>
                            <td className="py-2.5 px-3">
                              <span className={u.is_active === 1 ? 'text-sr-ok font-semibold' : 'text-sr-danger'}>
                                {u.is_active === 1 ? 'Active' : 'Disabled'}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              {u.id !== authUser.id && (
                                <button
                                  type="button"
                                  onClick={() => handleToggleUserAccess(u)}
                                  className="px-2.5 py-1 text-xs font-semibold rounded border border-sr-border hover:bg-sr-surface-alt cursor-pointer"
                                >
                                  {u.is_active === 1 ? 'Disable' : 'Enable'}
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* 5. Admin-Only: PostgreSQL Backups & Audit Logs */}
            {tab === 'backups' && authUser?.role === 'admin' && (
              <div className="space-y-6">
                <div className="p-5 rounded-xl border border-sr-border bg-sr-surface sr-surface-glass flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div>
                    <h3 className="text-base font-semibold text-sr-text">Database Backup &amp; Export</h3>
                    <p className="text-xs text-sr-muted mt-0.5">
                      Create and download PostgreSQL JSON snapshots.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleCreateBackup}
                    disabled={creatingBackup}
                    className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-sr-accent-text bg-sr-accent rounded-lg hover:bg-sr-accent-hover disabled:opacity-50 cursor-pointer"
                  >
                    <Database className="w-3.5 h-3.5" />
                    <span>{creatingBackup ? 'Creating Snapshot...' : 'Create Backup Now'}</span>
                  </button>
                </div>

                <div className="rounded-xl border border-sr-border bg-sr-surface sr-surface-glass overflow-hidden">
                  {backups.length === 0 ? (
                    <div className="p-8 text-center text-xs text-sr-muted">
                      No database backups created yet. Click &ldquo;Create Backup Now&rdquo; above.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-sr-surface-alt text-sr-muted border-b border-sr-border">
                          <tr>
                            <th className="py-2.5 px-4">Snapshot File</th>
                            <th className="py-2.5 px-4 text-right">Size (KB)</th>
                            <th className="py-2.5 px-4">Created At</th>
                            <th className="py-2.5 px-4 text-right">{t('common.actions')}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-sr-border">
                          {backups.map((b) => (
                            <tr key={b.filename}>
                              <td className="py-2.5 px-4 font-mono text-sr-text">{b.filename}</td>
                              <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                                {(b.sizeBytes / 1024).toFixed(1)}
                              </td>
                              <td className="py-2.5 px-4 font-mono tabular-nums text-sr-muted">
                                {b.createdAt.slice(0, 19).replace('T', ' ')}
                              </td>
                              <td className="py-2.5 px-4 text-right">
                                <button
                                  type="button"
                                  onClick={() => handleDownloadBackup(b.filename)}
                                  className="inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold text-sr-accent-ink bg-sr-accent-soft border border-sr-accent-border rounded hover:opacity-90 cursor-pointer"
                                >
                                  <Download className="w-3 h-3" />
                                  <span>Download .json</span>
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Security Audit Logs */}
                <div className="rounded-xl border border-sr-border bg-sr-surface sr-surface-glass overflow-hidden">
                  <div className="px-5 py-3.5 border-b border-sr-border">
                    <h3 className="text-sm font-semibold text-sr-text">{t('expert.auditTab')}</h3>
                  </div>
                  {auditLogs.length === 0 ? (
                    <p className="p-6 text-xs text-sr-muted">No security audit events recorded yet.</p>
                  ) : (
                    <div className="overflow-x-auto max-h-80">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-sr-surface-alt text-sr-muted border-b border-sr-border">
                          <tr>
                            <th className="py-2 px-4">{t('common.date')}</th>
                            <th className="py-2 px-4">Role</th>
                            <th className="py-2 px-4">Action</th>
                            <th className="py-2 px-4">Target</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-sr-border">
                          {auditLogs.slice(0, 40).map((log) => (
                            <tr key={log.id}>
                              <td className="py-2 px-4 font-mono tabular-nums text-sr-muted">
                                {log.created_at.slice(0, 19)}
                              </td>
                              <td className="py-2 px-4 uppercase font-semibold">{log.actor_role}</td>
                              <td className="py-2 px-4 font-mono text-sr-text">{log.action}</td>
                              <td className="py-2 px-4 font-mono text-sr-muted">
                                {log.target_type} #{log.target_id}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
