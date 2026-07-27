'use client';

import { useEffect, type ReactNode } from 'react';
import { Languages } from 'lucide-react';
// Importing the config initializes i18next as a side effect
import '@/lib/i18n/config';
import { isRTL } from '@/lib/i18n/config';
import { useTranslation } from 'react-i18next';

interface I18nProviderProps {
  children: ReactNode;
}

export function I18nProvider({ children }: I18nProviderProps): ReactNode {
  const { i18n, ready } = useTranslation();

  // Sync <html> attributes on mount and on every language change
  useEffect(() => {
    const lang = i18n.language ?? 'en';
    document.documentElement.lang = lang;
    document.documentElement.dir = isRTL(lang) ? 'rtl' : 'ltr';
  }, [i18n.language]);

  if (!ready) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground"
      >
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-card px-5 py-4 shadow-lg">
          <Languages className="h-5 w-5 animate-pulse text-stellar-blue" aria-hidden="true" />
          <span className="text-sm font-medium">Loading translations…</span>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
