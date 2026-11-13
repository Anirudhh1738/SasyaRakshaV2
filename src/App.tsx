import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Menu, User, X } from 'lucide-react';
import { AuthModal } from './components/AuthModal';
import { LanguageSwitcher } from './components/LanguageSwitcher';
import { SasyaRakshaLogo } from './components/Logo';
import { ThemeSwitcher } from './components/ThemeSwitcher';
import { changeAppLanguage } from './i18n';
import { DetectionPage } from './pages/DetectionPage';
import { ExpertPage } from './pages/ExpertPage';
import { HomePage } from './pages/HomePage';
import { MonitoringPage } from './pages/MonitoringPage';
import { OutbreakMapPage } from './pages/OutbreakMapPage';
import { PassportPage } from './pages/PassportPage';
import type { AuthUser, LanguageCode, PageId } from './types';

// Exact 5 primary navigation items in the continuous single-page architecture
const PRIMARY_NAV: Array<{ id: PageId; labelKey: string }> = [
  { id: 'home', labelKey: 'nav.home' },
  { id: 'scan-plant', labelKey: 'nav.detect' },
  { id: 'plant-monitoring', labelKey: 'nav.monitoring' },
  { id: 'outbreak-map', labelKey: 'nav.map' },
  { id: 'expert-portal', labelKey: 'nav.expert' },
];

export default function App() {
  const { t } = useTranslation();

  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Cross-section coordination
  const [activeSection, setActiveSection] = useState<PageId>('home');
  const [selectedPredictionId, setSelectedPredictionId] = useState<number | null>(null);
  const [preferredPlantId, setPreferredPlantId] = useState<number | null>(null);
  const [refreshSignal, setRefreshSignal] = useState(0);

  // Field Passport overlay (triggered by QR code link or button click)
  const [passportOverlay, setPassportOverlay] = useState<{ code: string; shareToken?: string } | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pCode = params.get('passport');
    const shareToken = params.get('token') || undefined;
    if (pCode) {
      setPassportOverlay({ code: pCode, shareToken });
    }

    const token = localStorage.getItem('agriguard_token') || '';
    fetch('/api/auth/me', {
      credentials: 'include',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.user) {
          setAuthUser(d.user);
          const pref = d.user.preferred_language as LanguageCode | undefined;
          if (pref && (pref === 'en' || pref === 'hi' || pref === 'kn')) {
            changeAppLanguage(pref).catch(() => {});
          }
        } else {
          localStorage.removeItem('agriguard_token');
          setAuthUser(null);
        }
      })
      .catch(() => {});
  }, []);

  // Track which of the 5 sections is currently in view for active link styling
  useEffect(() => {
    if (passportOverlay) return;
    const ids: PageId[] = ['home', 'scan-plant', 'plant-monitoring', 'outbreak-map', 'expert-portal'];
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id as PageId);
          }
        }
      },
      { rootMargin: '-35% 0px -55% 0px', threshold: 0.01 }
    );
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [passportOverlay]);

  function scrollToSection(sectionId: PageId) {
    setPassportOverlay(null);
    setMobileMenuOpen(false);
    setActiveSection(sectionId);
    window.requestAnimationFrame(() => {
      const el = document.getElementById(sectionId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  }

  function handleOpenResult(predictionId: number) {
    setSelectedPredictionId(predictionId);
    scrollToSection('scan-plant');
  }

  function handleOpenPassport(passportCode: string) {
    setPassportOverlay({ code: passportCode });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function handleAuthChanged(user: AuthUser | null) {
    setAuthUser(user);
    setRefreshSignal((s) => s + 1);
  }

  return (
    <div className="min-h-screen bg-sr-canvas-alt text-sr-text flex flex-col transition-colors">
      {/* Sticky Single-Row 3-Zone Top Navigation Bar (Exact 5 Primary Nav Links + Theme & Language + Separate Account Modal) */}
      <header className="sticky top-0 z-40 h-16 bg-sr-header backdrop-blur-md border-b border-sr-border px-3 sm:px-8 flex items-center justify-between gap-2 sm:gap-4 transition-colors">
        {/* Zone 1: Brand */}
        <button
          type="button"
          onClick={() => scrollToSection('home')}
          className="flex items-center gap-2.5 font-bold text-base tracking-tight text-sr-text whitespace-nowrap shrink-0 cursor-pointer"
        >
          <SasyaRakshaLogo className="w-6 h-6 shrink-0" />
          <span>SasyaRaksha</span>
        </button>

        {/* Zone 2: Exact 5 Primary Nav Links */}
        <nav className="hidden lg:flex items-center gap-6" aria-label="Primary Navigation">
          {PRIMARY_NAV.map((item) => {
            const active = !passportOverlay && activeSection === item.id;
            return (
              <a
                key={item.id}
                href={`#${item.id}`}
                onClick={(e) => {
                  e.preventDefault();
                  scrollToSection(item.id);
                }}
                className={`text-sm transition-colors whitespace-nowrap shrink-0 ${
                  active ? 'text-sr-accent-ink font-semibold' : 'text-sr-muted hover:text-sr-text font-medium'
                }`}
              >
                {t(item.labelKey)}
              </a>
            );
          })}
        </nav>

        {/* Zone 3: Theme Switcher + Language Switcher + Account Login/Profile + Mobile Menu Toggle */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="hidden sm:block">
            <ThemeSwitcher />
          </div>
          <LanguageSwitcher />
          <button
            type="button"
            onClick={() => setAuthModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-semibold rounded-lg border border-sr-border bg-sr-surface hover:bg-sr-accent-soft text-sr-text whitespace-nowrap shrink-0 transition-colors cursor-pointer"
          >
            <User className="w-3.5 h-3.5 text-sr-accent-ink shrink-0" />
            <span>{authUser ? authUser.name.split(' ')[0] : t('auth.accountBtn')}</span>
          </button>

          <button
            type="button"
            onClick={() => setMobileMenuOpen((v) => !v)}
            className="lg:hidden p-2 rounded-lg border border-sr-border bg-sr-surface text-sr-text cursor-pointer"
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="lg:hidden sticky top-16 z-30 bg-sr-surface border-b border-sr-border px-5 py-3 space-y-2">
          <div className="sm:hidden pb-2 border-b border-sr-border flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-sr-muted">
              {t('theme.selectorLabel', { defaultValue: 'Theme' })}
            </span>
            <ThemeSwitcher compact />
          </div>
          {PRIMARY_NAV.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              onClick={(e) => {
                e.preventDefault();
                scrollToSection(item.id);
              }}
              className={`block py-2 px-3 rounded-lg text-sm font-medium ${
                activeSection === item.id ? 'bg-sr-accent-soft text-sr-accent-ink font-semibold' : 'text-sr-text'
              }`}
            >
              {t(item.labelKey)}
            </a>
          ))}
        </div>
      )}

      {/* Main View: Field Passport Overlay OR Continuous 5-Section Experience */}
      {passportOverlay ? (
        <main className="flex-1 p-4 sm:p-8 max-w-[1160px] w-full mx-auto">
          <PassportPage
            passportCode={passportOverlay.code}
            shareToken={passportOverlay.shareToken}
            onBack={() => {
              setPassportOverlay(null);
              if (window.location.search.includes('passport=')) {
                window.history.replaceState({}, '', window.location.pathname);
              }
            }}
          />
        </main>
      ) : (
        <main className="flex-1">
          <HomePage onScrollTo={scrollToSection} />
          <DetectionPage
            authUser={authUser}
            selectedPredictionId={selectedPredictionId}
            onConsumeSelectedPrediction={() => setSelectedPredictionId(null)}
            onRequireAuth={() => setAuthModalOpen(true)}
            onScrollTo={scrollToSection}
            onOpenPassport={handleOpenPassport}
            onInspectionSaved={(plantId) => {
              if (plantId) setPreferredPlantId(plantId);
              setRefreshSignal((s) => s + 1);
            }}
          />
          <MonitoringPage
            authUser={authUser}
            refreshSignal={refreshSignal}
            preferredPlantId={preferredPlantId}
            onRequireAuth={() => setAuthModalOpen(true)}
            onScrollTo={scrollToSection}
            onOpenResult={handleOpenResult}
            onOpenPassport={handleOpenPassport}
          />
          <OutbreakMapPage refreshSignal={refreshSignal} />
          <ExpertPage
            authUser={authUser}
            onAuthChanged={(u) => handleAuthChanged(u)}
            onDataUpdated={() => setRefreshSignal((s) => s + 1)}
          />
        </main>
      )}

      {/* Minimal Reference Footer */}
      <footer className="bg-sr-footer text-sr-footer-text py-8 px-5 sm:px-8 border-t border-sr-border">
        <div className="max-w-[1160px] mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs">
          <p>{t('brand.footerNotice')}</p>
          <div className="flex flex-wrap items-center gap-4">
            {PRIMARY_NAV.map((item) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                onClick={(e) => {
                  e.preventDefault();
                  scrollToSection(item.id);
                }}
                className="hover:text-sr-accent-ink transition-colors"
              >
                {t(item.labelKey)}
              </a>
            ))}
          </div>
        </div>
      </footer>

      {/* Separate Farmer Account Login / Register / Password Change Modal */}
      <AuthModal
        open={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        user={authUser}
        onAuthChanged={(u) => handleAuthChanged(u)}
      />
    </div>
  );
}
