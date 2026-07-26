'use client';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import {
  applyThemeToDocument,
  getStoredTheme,
  getSystemPrefersDark,
  persistTheme,
  resolveTheme,
  type ResolvedTheme,
} from '@/lib/theme';
import type { Theme } from '@/types/settings';

function subscribeToSystemTheme(onStoreChange: () => void): () => void {
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener('change', onStoreChange);
  return () => mq.removeEventListener('change', onStoreChange);
}

function getSystemThemeSnapshot(): ResolvedTheme {
  return getSystemPrefersDark() ? 'dark' : 'light';
}

function getServerThemeSnapshot(): ResolvedTheme {
  return 'dark';
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => getStoredTheme());
  const systemTheme = useSyncExternalStore(
    subscribeToSystemTheme,
    getSystemThemeSnapshot,
    getServerThemeSnapshot
  );

  const resolvedTheme: ResolvedTheme =
    theme === 'system' ? systemTheme : resolveTheme(theme, systemTheme === 'dark');

  useEffect(() => {
    applyThemeToDocument(theme);
    persistTheme(theme);
  }, [theme, systemTheme]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
  }, []);

  const toggle = useCallback(() => {
    setThemeState(resolvedTheme === 'dark' ? 'light' : 'dark');
  }, [resolvedTheme]);

  return {
    theme,
    resolvedTheme,
    setTheme,
    toggle,
    isDark: resolvedTheme === 'dark',
  };
}
