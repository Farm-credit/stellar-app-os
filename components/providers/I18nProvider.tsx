'use client';

import { useEffect, type ReactNode } from 'react';
// Importing the config initializes i18next as a side effect
import '@/lib/i18n/config';
import { isRTL } from '@/lib/i18n/config';
import { useTranslation } from 'react-i18next';

interface I18nProviderProps {
  children: ReactNode;
}

export function I18nProvider({ children }: I18nProviderProps): ReactNode {
  const { i18n } = useTranslation();

  // Sync <html> attributes on mount and on every language change
  useEffect(() => {
    const lang = i18n.language ?? 'en';
    document.documentElement.lang = lang;
    document.documentElement.dir = isRTL(lang) ? 'rtl' : 'ltr';
  }, [i18n.language]);

  return <>{children}</>;
}