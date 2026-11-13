import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './en.json';
import hi from './hi.json';
import kn from './kn.json';
import type { LanguageCode } from '../types';

const STORAGE_KEY = 'sasyaraksha_lang';

function getInitialLanguage(): LanguageCode {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'en' || saved === 'hi' || saved === 'kn') {
      return saved;
    }
  } catch {
    // ignore storage restriction
  }
  return 'en';
}

const initialLng = getInitialLanguage();
if (typeof document !== 'undefined') {
  document.documentElement.lang = initialLng;
}

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    hi: { translation: hi },
    kn: { translation: kn },
  },
  lng: initialLng,
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false,
  },
});

export async function changeAppLanguage(lang: LanguageCode): Promise<void> {
  await i18n.changeLanguage(lang);
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // ignore
  }
  if (typeof document !== 'undefined') {
    document.documentElement.lang = lang;
  }
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('agriguard_token') : null;
  if (token) {
    fetch('/api/auth/language', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ language: lang }),
    }).catch(() => {});
  }
}

export const SUPPORTED_LANGUAGES: Array<{ code: LanguageCode; nativeLabel: string }> = [
  { code: 'en', nativeLabel: 'English' },
  { code: 'hi', nativeLabel: 'हिंदी' },
  { code: 'kn', nativeLabel: 'ಕನ್ನಡ' },
];

export default i18n;
