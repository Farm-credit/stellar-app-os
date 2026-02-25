'use client';

import { useTranslation as useI18nTranslation } from 'react-i18next';
import type { SupportedLanguage } from '@/lib/i18n/config';
import { SUPPORTED_LANGUAGES, isRTL } from '@/lib/i18n/config';

interface UseAppTranslationReturn {
  t: ReturnType<typeof useI18nTranslation>['t'];
  language: SupportedLanguage;
  changeLanguage: (lang: SupportedLanguage) => Promise<void>;
  isRTLLanguage: boolean;
  supportedLanguages: ReadonlyArray<SupportedLanguage>;
  formatDate: (date: Date, options?: Intl.DateTimeFormatOptions) => string;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
  formatCurrency: (value: number, currency?: string) => string;
}

const LOCALE_MAP: Record<SupportedLanguage, string> = {
  en: 'en-US',
  es: 'es-ES',
  fr: 'fr-FR',
  pt: 'pt-BR',
};

export function useAppTranslation(): UseAppTranslationReturn {
  const { t, i18n } = useI18nTranslation();

  const language = (
    SUPPORTED_LANGUAGES.includes(i18n.language as SupportedLanguage)
      ? i18n.language
      : 'en'
  ) as SupportedLanguage;

  const locale = LOCALE_MAP[language];

  async function changeLanguage(lang: SupportedLanguage): Promise<void> {
    await i18n.changeLanguage(lang);
    // Update <html> dir and lang attributes for accessibility + RTL prep
    document.documentElement.lang = lang;
    document.documentElement.dir = isRTL(lang) ? 'rtl' : 'ltr';
  }

  function formatDate(date: Date, options?: Intl.DateTimeFormatOptions): string {
    return new Intl.DateTimeFormat(locale, options).format(date);
  }

  function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
    return new Intl.NumberFormat(locale, options).format(value);
  }

  function formatCurrency(value: number, currency = 'USD'): string {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
    }).format(value);
  }

  return {
    t,
    language,
    changeLanguage,
    isRTLLanguage: isRTL(language),
    supportedLanguages: SUPPORTED_LANGUAGES,
    formatDate,
    formatNumber,
    formatCurrency,
  };
}