import { Globe } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { changeAppLanguage, SUPPORTED_LANGUAGES } from '../i18n';
import type { LanguageCode } from '../types';

export function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const current = (i18n.language as LanguageCode) || 'en';

  return (
    <div
      className="inline-flex items-center rounded-lg border border-sr-border bg-sr-surface-alt p-0.5 shrink-0"
      role="group"
      aria-label="Language selector"
    >
      <Globe className="w-3.5 h-3.5 text-sr-accent-ink mx-1.5 hidden sm:block shrink-0" aria-hidden="true" />
      {SUPPORTED_LANGUAGES.map((lang) => {
        const active = current === lang.code;
        return (
          <button
            key={lang.code}
            type="button"
            onClick={() => changeAppLanguage(lang.code)}
            className={`px-2 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              active
                ? 'bg-sr-accent text-sr-accent-text'
                : 'text-sr-text hover:bg-sr-accent-soft'
            }`}
          >
            {lang.nativeLabel}
          </button>
        );
      })}
    </div>
  );
}
