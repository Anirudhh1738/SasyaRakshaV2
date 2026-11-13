import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'motion/react';
import { Eye, EyeOff, KeyRound, Lock, LogOut, Mail, MapPin, ShieldCheck, User, UserPlus, X } from 'lucide-react';
import { changeAppLanguage } from '../i18n';
import type { AuthUser, LanguageCode } from '../types';

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
  user: AuthUser | null;
  onAuthChanged: (user: AuthUser | null, token: string) => void;
}

export function AuthModal({ open, onClose, user, onAuthChanged }: AuthModalProps) {
  const { t, i18n } = useTranslation();
  const lang = (['en', 'hi', 'kn'].includes(i18n.language) ? i18n.language : 'en') as LanguageCode;

  const [tab, setTab] = useState<'login' | 'register' | 'reset'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [region, setRegion] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [infoMsg, setInfoMsg] = useState('');

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');
    setInfoMsg('');
    try {
      const resp = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, portal: 'general' }),
      });
      const json = await resp.json();
      if (!resp.ok) {
        setErrorMsg(json.error || 'Sign in failed.');
        return;
      }
      localStorage.setItem('agriguard_token', json.token);
      if (json.user?.preferred_language) {
        changeAppLanguage(json.user.preferred_language).catch(() => {});
      }
      onAuthChanged(json.user, json.token);
      setPassword('');
      onClose();
    } catch {
      setErrorMsg('Unable to connect to authentication server.');
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');
    setInfoMsg('');
    try {
      const resp = await fetch('/api/auth/register', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          email,
          password,
          region: region || 'General Agricultural Zone',
          preferredLanguage: lang,
        }),
      });
      const json = await resp.json();
      if (!resp.ok) {
        setErrorMsg(json.error || 'Registration failed.');
        return;
      }
      localStorage.setItem('agriguard_token', json.token);
      onAuthChanged(json.user, json.token);
      setPassword('');
      onClose();
    } catch {
      setErrorMsg('Unable to register right now.');
    } finally {
      setLoading(false);
    }
  }

  async function handleResetRequest(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');
    setInfoMsg('');
    try {
      const resp = await fetch('/api/auth/reset-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const json = await resp.json();
      if (!resp.ok) {
        setErrorMsg(json.error || 'Unable to process reset request.');
        return;
      }
      setInfoMsg(json.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');
    setInfoMsg('');
    const token = localStorage.getItem('agriguard_token') || '';
    try {
      const resp = await fetch('/api/auth/change-password', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const json = await resp.json();
      if (!resp.ok) {
        setErrorMsg(json.error || 'Could not change password.');
        return;
      }
      setCurrentPassword('');
      setNewPassword('');
      setInfoMsg(json.message || 'Password updated.');
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    const token = localStorage.getItem('agriguard_token') || '';
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    }).catch(() => {});
    localStorage.removeItem('agriguard_token');
    onAuthChanged(null, '');
    onClose();
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-md rounded-2xl sr-auth-card overflow-hidden relative"
          >
            {/* Subtle top ambient highlight */}
            <div
              className="pointer-events-none absolute -top-24 -right-24 w-56 h-56 rounded-full blur-3xl opacity-25"
              style={{ background: 'radial-gradient(circle, #F97316 0%, transparent 70%)' }}
              aria-hidden="true"
            />

            <div className="px-6 py-4 border-b border-[var(--sr-auth-border)] flex items-center justify-between relative z-10">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-orange-500/15 border border-orange-400/35 text-orange-300 flex items-center justify-center shrink-0">
                  {user ? (
                    <ShieldCheck className="w-4 h-4" />
                  ) : tab === 'register' ? (
                    <UserPlus className="w-4 h-4" />
                  ) : (
                    <Lock className="w-4 h-4" />
                  )}
                </div>
                <div>
                  <h2 className="text-sm font-bold text-[var(--sr-auth-text)]">
                    {user
                      ? t('auth.accountTitle')
                      : tab === 'register'
                      ? t('expert.registerTitle')
                      : tab === 'reset'
                      ? t('auth.resetTitle')
                      : t('expert.signInTitle')}
                  </h2>
                  <p className="text-[11px] text-[var(--sr-auth-muted)]">SasyaRaksha</p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-lg text-[var(--sr-auth-muted)] hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                aria-label="Close account modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-5 relative z-10">
              {user ? (
                <div className="space-y-5">
                  <div
                    className="p-4 rounded-xl border border-[var(--sr-auth-border)] space-y-1"
                    style={{ background: 'var(--sr-auth-surface)' }}
                  >
                    <p className="text-sm font-bold text-[var(--sr-auth-text)]">{user.name}</p>
                    <p className="text-xs text-[var(--sr-auth-muted)]">{user.email}</p>
                    <p className="text-xs text-orange-300 font-semibold pt-0.5">
                      {user.region} · {user.role.toUpperCase()}
                    </p>
                  </div>

                  <form onSubmit={handleChangePassword} className="space-y-3 pt-3 border-t border-[var(--sr-auth-border)]">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--sr-auth-text)]">
                      <KeyRound className="w-3.5 h-3.5 text-orange-300" />
                      <span>{t('auth.changePassword')}</span>
                    </div>
                    <div className="relative">
                      <Lock className="w-3.5 h-3.5 text-[var(--sr-auth-muted)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="password"
                        required
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        placeholder={t('auth.currentPassword')}
                        className="w-full pl-9 pr-3 py-2 text-xs rounded-lg sr-auth-input"
                      />
                    </div>
                    <div className="relative">
                      <KeyRound className="w-3.5 h-3.5 text-[var(--sr-auth-muted)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type={showNewPassword ? 'text' : 'password'}
                        required
                        minLength={6}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder={t('auth.newPassword')}
                        className="w-full pl-9 pr-9 py-2 text-xs rounded-lg sr-auth-input"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword((v) => !v)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--sr-auth-muted)] hover:text-orange-300 transition-colors cursor-pointer"
                        aria-label="Toggle new password visibility"
                      >
                        {showNewPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                    {errorMsg && (
                      <p className="text-xs text-red-300 bg-red-950/50 border border-red-400/35 rounded-lg px-3 py-2">
                        {errorMsg}
                      </p>
                    )}
                    {infoMsg && (
                      <p className="text-xs text-emerald-300 bg-emerald-950/50 border border-emerald-400/35 rounded-lg px-3 py-2">
                        {infoMsg}
                      </p>
                    )}
                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full py-2.5 px-4 text-xs font-semibold rounded-lg sr-auth-cta cursor-pointer"
                    >
                      {loading ? t('common.loading') : t('auth.updatePasswordBtn')}
                    </button>
                  </form>

                  <button
                    type="button"
                    onClick={handleLogout}
                    className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 text-xs font-semibold text-red-200 bg-red-950/45 border border-red-400/35 rounded-lg hover:bg-red-900/50 transition-colors cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>{t('expert.signOut')}</span>
                  </button>
                </div>
              ) : (
                <>
                  <div
                    className="grid grid-cols-2 gap-1.5 p-1 rounded-xl border border-[var(--sr-auth-border)]"
                    style={{ background: 'var(--sr-auth-input-bg)' }}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setTab('login');
                        setErrorMsg('');
                        setInfoMsg('');
                      }}
                      className={`py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                        tab === 'login'
                          ? 'bg-orange-500/20 text-orange-200 border border-orange-400/40'
                          : 'text-[var(--sr-auth-muted)] hover:text-white border border-transparent'
                      }`}
                    >
                      {t('expert.signInTab')}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setTab('register');
                        setErrorMsg('');
                        setInfoMsg('');
                      }}
                      className={`py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                        tab === 'register'
                          ? 'bg-orange-500/20 text-orange-200 border border-orange-400/40'
                          : 'text-[var(--sr-auth-muted)] hover:text-white border border-transparent'
                      }`}
                    >
                      {t('expert.registerTab')}
                    </button>
                  </div>

                  <AnimatePresence mode="wait">
                    {tab === 'login' && (
                      <motion.form
                        key="login"
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        transition={{ duration: 0.16 }}
                        onSubmit={handleLogin}
                        className="space-y-4"
                      >
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
                              placeholder="farmer@example.com"
                              className="w-full pl-9 pr-3 py-2.5 text-sm rounded-lg sr-auth-input"
                            />
                          </div>
                        </div>

                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <label className="text-xs font-medium text-[var(--sr-auth-muted)]">
                              {t('expert.password')}
                            </label>
                            <button
                              type="button"
                              onClick={() => {
                                setTab('reset');
                                setErrorMsg('');
                                setInfoMsg('');
                              }}
                              className="text-[11px] font-medium text-orange-300 hover:text-orange-200 hover:underline cursor-pointer"
                            >
                              {t('auth.forgotPassword')}
                            </button>
                          </div>
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
                              aria-label="Toggle password visibility"
                            >
                              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          </div>
                        </div>

                        {errorMsg && (
                          <p className="text-xs text-red-300 bg-red-950/50 border border-red-400/35 rounded-lg px-3 py-2">
                            {errorMsg}
                          </p>
                        )}

                        <button
                          type="submit"
                          disabled={loading}
                          className="w-full py-2.5 px-4 text-sm font-semibold rounded-lg sr-auth-cta cursor-pointer"
                        >
                          {loading ? t('common.loading') : t('expert.signInBtn')}
                        </button>
                      </motion.form>
                    )}

                    {tab === 'register' && (
                      <motion.form
                        key="register"
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        transition={{ duration: 0.16 }}
                        onSubmit={handleRegister}
                        className="space-y-3.5"
                      >
                        <div>
                          <label className="block text-xs font-medium text-[var(--sr-auth-muted)] mb-1">
                            {t('expert.fullName')}
                          </label>
                          <div className="relative">
                            <User className="w-4 h-4 text-[var(--sr-auth-muted)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                            <input
                              type="text"
                              required
                              value={name}
                              onChange={(e) => setName(e.target.value)}
                              placeholder="Ramesh Kumar"
                              className="w-full pl-9 pr-3 py-2 text-sm rounded-lg sr-auth-input"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-[var(--sr-auth-muted)] mb-1">
                            {t('expert.email')}
                          </label>
                          <div className="relative">
                            <Mail className="w-4 h-4 text-[var(--sr-auth-muted)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                            <input
                              type="email"
                              required
                              value={email}
                              onChange={(e) => setEmail(e.target.value)}
                              placeholder="ramesh@farm.in"
                              className="w-full pl-9 pr-3 py-2 text-sm rounded-lg sr-auth-input"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-[var(--sr-auth-muted)] mb-1">
                            {t('expert.password')}
                          </label>
                          <div className="relative">
                            <Lock className="w-4 h-4 text-[var(--sr-auth-muted)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                            <input
                              type={showPassword ? 'text' : 'password'}
                              required
                              minLength={6}
                              value={password}
                              onChange={(e) => setPassword(e.target.value)}
                              placeholder="Minimum 6 characters"
                              className="w-full pl-9 pr-10 py-2 text-sm rounded-lg sr-auth-input"
                            />
                            <button
                              type="button"
                              onClick={() => setShowPassword((v) => !v)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--sr-auth-muted)] hover:text-orange-300 transition-colors cursor-pointer"
                              aria-label="Toggle password visibility"
                            >
                              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-[var(--sr-auth-muted)] mb-1">
                            {t('expert.region')}
                          </label>
                          <div className="relative">
                            <MapPin className="w-4 h-4 text-[var(--sr-auth-muted)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                            <input
                              type="text"
                              value={region}
                              onChange={(e) => setRegion(e.target.value)}
                              placeholder="Mandya / Nashik"
                              className="w-full pl-9 pr-3 py-2 text-sm rounded-lg sr-auth-input"
                            />
                          </div>
                        </div>

                        {errorMsg && (
                          <p className="text-xs text-red-300 bg-red-950/50 border border-red-400/35 rounded-lg px-3 py-2">
                            {errorMsg}
                          </p>
                        )}

                        <button
                          type="submit"
                          disabled={loading}
                          className="w-full py-2.5 px-4 text-sm font-semibold rounded-lg sr-auth-cta cursor-pointer"
                        >
                          {loading ? t('common.loading') : t('expert.registerBtn')}
                        </button>
                      </motion.form>
                    )}

                    {tab === 'reset' && (
                      <motion.form
                        key="reset"
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        transition={{ duration: 0.16 }}
                        onSubmit={handleResetRequest}
                        className="space-y-4"
                      >
                        <p className="text-xs text-[var(--sr-auth-muted)] leading-relaxed">{t('auth.resetHint')}</p>
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
                              placeholder="farmer@example.com"
                              className="w-full pl-9 pr-3 py-2.5 text-sm rounded-lg sr-auth-input"
                            />
                          </div>
                        </div>
                        {errorMsg && (
                          <p className="text-xs text-red-300 bg-red-950/50 border border-red-400/35 rounded-lg px-3 py-2">
                            {errorMsg}
                          </p>
                        )}
                        {infoMsg && (
                          <div
                            className="p-3 rounded-lg border border-[var(--sr-auth-border)] text-xs text-[var(--sr-auth-text)] leading-relaxed"
                            style={{ background: 'var(--sr-auth-surface)' }}
                          >
                            {infoMsg}
                          </div>
                        )}
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setTab('login')}
                            className="px-4 py-2.5 text-xs font-semibold border border-[var(--sr-auth-border)] text-[var(--sr-auth-text)] rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
                          >
                            {t('common.back')}
                          </button>
                          <button
                            type="submit"
                            disabled={loading}
                            className="flex-1 py-2.5 px-4 text-xs font-semibold rounded-lg sr-auth-cta cursor-pointer"
                          >
                            {loading ? t('common.loading') : t('auth.requestResetBtn')}
                          </button>
                        </div>
                      </motion.form>
                    )}
                  </AnimatePresence>
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
