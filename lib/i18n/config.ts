import i18n, { type InitOptions } from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import enTranslations from '@/lib/i18n/locales/en.json';
import esTranslations from '@/lib/i18n/locales/es.json';
import frTranslations from '@/lib/i18n/locales/fr.json';
import ptTranslations from '@/lib/i18n/locales/pt.json';
import haTranslations from '@/lib/i18n/locales/ha.json';

export const SUPPORTED_LANGUAGES = ['en', 'ha', 'fr', 'es', 'pt'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const LANGUAGE_LABELS: Record<SupportedLanguage, string> = {
  en: 'English',
  ha: 'Hausa',
  fr: 'Français',
  es: 'Español',
  pt: 'Português',
};

// RTL languages — Arabic prepared for future use
export const RTL_LANGUAGES: ReadonlyArray<string> = ['ar'];

export function isRTL(lang: string): boolean {
  return RTL_LANGUAGES.includes(lang);
}

const i18nConfig: InitOptions = {
  resources: {
    en: { translation: enTranslations },
    ha: { translation: haTranslations },
    fr: { translation: frTranslations },
    es: { translation: esTranslations },
    pt: { translation: ptTranslations },
  },
  fallbackLng: 'en',
  supportedLngs: [...SUPPORTED_LANGUAGES],
  interpolation: {
    escapeValue: false,
  },
  detection: {
    // Order matters: localStorage first so persisted choice wins
    order: ['localStorage', 'navigator', 'htmlTag'],
    lookupLocalStorage: 'farmcredit-language',
    caches: ['localStorage'], // This replaces 'cacheUserLanguage: true'
  },
};

if (!i18n.isInitialized) {
  i18n.use(LanguageDetector).use(initReactI18next).init(i18nConfig);
}

export default i18n;
