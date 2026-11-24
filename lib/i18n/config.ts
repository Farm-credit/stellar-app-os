import i18n, { type InitOptions } from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from '@/lib/i18n/languages';
import enTranslations from '@/lib/i18n/locales/en.json';
import esTranslations from '@/lib/i18n/locales/es.json';
import frTranslations from '@/lib/i18n/locales/fr.json';
import deTranslations from '@/lib/i18n/locales/de.json';
import ptTranslations from '@/lib/i18n/locales/pt.json';
import jaTranslations from '@/lib/i18n/locales/ja.json';
import zhTranslations from '@/lib/i18n/locales/zh.json';
import hiTranslations from '@/lib/i18n/locales/hi.json';
import arTranslations from '@/lib/i18n/locales/ar.json';
import swTranslations from '@/lib/i18n/locales/sw.json';
import haTranslations from '@/lib/i18n/locales/ha.json';

export { SUPPORTED_LANGUAGES };
export type { SupportedLanguage };

export const LANGUAGE_LABELS: Record<SupportedLanguage, string> = {
  en: 'English',
  es: 'Español',
  fr: 'Français',
  de: 'Deutsch',
  pt: 'Português',
  ja: '日本語',
  zh: '中文',
  hi: 'हिन्दी',
  ar: 'العربية',
  sw: 'Kiswahili',
  ha: 'Hausa',
};

// RTL languages
export const RTL_LANGUAGES: ReadonlyArray<string> = ['ar'];

export function normalizeLanguage(lang?: string): SupportedLanguage {
  if (!lang) return 'en';
  const base = lang.split('-')[0].toLowerCase();
  return SUPPORTED_LANGUAGES.includes(base as SupportedLanguage)
    ? (base as SupportedLanguage)
    : 'en';
}

export function isRTL(lang: string): boolean {
  const base = lang.split('-')[0].toLowerCase();
  return RTL_LANGUAGES.includes(base);
}

const i18nConfig: InitOptions = {
  resources: {
    en: { translation: enTranslations },
    es: { translation: esTranslations },
    fr: { translation: frTranslations },
    de: { translation: deTranslations },
    pt: { translation: ptTranslations },
    ja: { translation: jaTranslations },
    zh: { translation: zhTranslations },
    hi: { translation: hiTranslations },
    ar: { translation: arTranslations },
    sw: { translation: swTranslations },
    ha: { translation: haTranslations },
  },
  fallbackLng: 'en',
  supportedLngs: [...SUPPORTED_LANGUAGES],
  nonExplicitSupportedLngs: true,
  load: 'languageOnly',
  interpolation: {
    escapeValue: false,
  },
  detection: {
    // Order matters: localStorage first so persisted choice wins, then browser navigator
    order: ['localStorage', 'navigator', 'htmlTag'],
    lookupLocalStorage: 'farmcredit-language',
    caches: ['localStorage'],
  },
};

if (!i18n.isInitialized) {
  i18n.use(LanguageDetector).use(initReactI18next).init(i18nConfig);
}

export default i18n;
