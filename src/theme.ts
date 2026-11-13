import { useEffect, useState } from 'react';

export type ThemeId = 'light' | 'dark' | 'agriglow';

export const THEME_STORAGE_KEY = 'sasyaraksha_theme';

export const THEME_OPTIONS: Array<{ id: ThemeId; labelKey: string; fallbackLabel: string }> = [
  { id: 'light', labelKey: 'theme.light', fallbackLabel: 'Light' },
  { id: 'dark', labelKey: 'theme.dark', fallbackLabel: 'Dark' },
  { id: 'agriglow', labelKey: 'theme.agriglow', fallbackLabel: 'AgriGlow' },
];

export function isValidTheme(val: unknown): val is ThemeId {
  return val === 'light' || val === 'dark' || val === 'agriglow';
}

export function getSavedTheme(): ThemeId {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    return isValidTheme(raw) ? raw : 'light';
  } catch {
    return 'light';
  }
}

export function applyTheme(theme: ThemeId): void {
  const root = document.documentElement;
  root.setAttribute('data-theme', theme);
  if (theme === 'dark' || theme === 'agriglow') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // ignore storage errors in restricted contexts
  }
  window.dispatchEvent(new CustomEvent<ThemeId>('sasyaraksha-theme-change', { detail: theme }));
}

export function initTheme(): ThemeId {
  const saved = getSavedTheme();
  applyTheme(saved);
  return saved;
}

export function useTheme(): [ThemeId, (next: ThemeId) => void] {
  const [theme, setThemeState] = useState<ThemeId>(() => {
    const current = document.documentElement.getAttribute('data-theme');
    return isValidTheme(current) ? current : getSavedTheme();
  });

  useEffect(() => {
    const handler = (e: Event) => {
      const next = (e as CustomEvent<ThemeId>).detail;
      if (isValidTheme(next)) setThemeState(next);
    };
    const storageHandler = (e: StorageEvent) => {
      if (e.key === THEME_STORAGE_KEY && isValidTheme(e.newValue)) {
        applyTheme(e.newValue);
      }
    };
    window.addEventListener('sasyaraksha-theme-change', handler);
    window.addEventListener('storage', storageHandler);
    return () => {
      window.removeEventListener('sasyaraksha-theme-change', handler);
      window.removeEventListener('storage', storageHandler);
    };
  }, []);

  return [theme, applyTheme];
}
