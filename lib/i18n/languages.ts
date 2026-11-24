export const SUPPORTED_LANGUAGES = [
  'en',
  'es',
  'fr',
  'de',
  'pt',
  'ja',
  'zh',
  'hi',
  'ar',
  'sw',
  'ha',
] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];
