import i18n from 'i18next';
import { initReactI8next } from 'react-i18next';
import en from './messages/en.json';
const resources = { en: { translation: en }, es: { translation: en }, fr: { translation: en }, zh: { translation: en }, ar: { translation: en } };
export const supportedLngs = ['en', 'es', 'fr', 'zh', 'ar'];
export const getDir = (lng: string) => (lng === 'ar' ? 'rtl' : 'ltr');
export function initI8n() {
  if (!i18n.isInitialized) {
    i18n.use(initReactI8next).init({
      resources,
      fallbackLng: 'en',
      supportedLngs: [...supportedLngs],
      interpolation: { escapeValue: false },
    });
  }
  return i18n;
}
export default i18n;