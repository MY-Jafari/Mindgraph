import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import fa from './locales/fa.json';

const LANGUAGE_KEY = 'mindgraph_language';

export const supportedLanguages = [
  { code: 'en', label: 'English', dir: 'ltr' },
  { code: 'fa', label: 'فارسی', dir: 'rtl' },
] as const;

export type SupportedLanguage = (typeof supportedLanguages)[number]['code'];

export function getInitialLanguage(): SupportedLanguage {
  if (typeof window === 'undefined') return 'en';
  const saved = localStorage.getItem(LANGUAGE_KEY);
  if (saved === 'fa' || saved === 'en') return saved;
  const browserLang = navigator.language.toLowerCase();
  return browserLang.startsWith('fa') ? 'fa' : 'en';
}

export function applyLanguageDirection(lang: string) {
  if (typeof document === 'undefined') return;
  const isRtl = lang === 'fa';
  document.documentElement.dir = isRtl ? 'rtl' : 'ltr';
  document.documentElement.lang = lang;
  if (isRtl) {
    document.documentElement.classList.add('rtl-mode');
  } else {
    document.documentElement.classList.remove('rtl-mode');
  }
}

const initialLang = getInitialLanguage();
applyLanguageDirection(initialLang);

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      fa: { translation: fa },
    },
    lng: initialLang,
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
  });

i18n.on('languageChanged', (lng) => {
  localStorage.setItem(LANGUAGE_KEY, lng);
  applyLanguageDirection(lng);
});

export default i18n;
