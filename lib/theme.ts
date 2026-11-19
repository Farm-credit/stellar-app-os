import type { Theme } from '@/types/settings';

export const THEME_STORAGE_KEY = 'theme';

export type ResolvedTheme = 'light' | 'dark';

const VALID_THEMES: Theme[] = ['light', 'dark', 'system'];

export function isTheme(value: string | null | undefined): value is Theme {
  return value === 'light' || value === 'dark' || value === 'system';
}

export function resolveTheme(theme: Theme, prefersDark = false): ResolvedTheme {
  if (theme === 'light' || theme === 'dark') return theme;
  return prefersDark ? 'dark' : 'light';
}

export function getSystemPrefersDark(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function getStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'system';
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  return isTheme(stored) ? stored : 'system';
}

export function applyThemeToDocument(theme: Theme): ResolvedTheme {
  const resolved = resolveTheme(theme, getSystemPrefersDark());
  document.documentElement.classList.toggle('dark', resolved === 'dark');
  document.documentElement.dataset.theme = theme;
  return resolved;
}

export function persistTheme(theme: Theme): void {
  if (!VALID_THEMES.includes(theme)) return;
  localStorage.setItem(THEME_STORAGE_KEY, theme);
}
