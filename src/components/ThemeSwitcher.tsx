import { Moon, Sparkles, Sun } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { THEME_OPTIONS, type ThemeId, useTheme } from '../theme';

const ICONS: Record<ThemeId, typeof Sun> = {
  light: Sun,
  dark: Moon,
  agriglow: Sparkles,
};

export function ThemeSwitcher({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();
  const [theme, setTheme] = useTheme();

  return (
    <div
      className="inline-flex items-center rounded-lg border border-sr-border bg-sr-surface-alt p-0.5 shrink-0"
      role="group"
      aria-label={t('theme.selectorLabel', { defaultValue: 'Theme selector' })}
    >
      {THEME_OPTIONS.map((opt) => {
        const Icon = ICONS[opt.id];
        const active = theme === opt.id;
        const label = t(opt.labelKey, { defaultValue: opt.fallbackLabel });
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => setTheme(opt.id)}
            aria-pressed={active}
            title={label}
            className={`inline-flex items-center gap-1.5 px-2 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              active
                ? 'bg-sr-accent text-sr-accent-text'
                : 'text-sr-muted hover:text-sr-text hover:bg-sr-accent-soft'
            }`}
          >
            <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span className={compact ? '' : 'hidden xl:inline'}>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
