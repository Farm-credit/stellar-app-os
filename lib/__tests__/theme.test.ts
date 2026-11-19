import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import {
  isTheme,
  resolveTheme,
  getSystemPrefersDark,
  getStoredTheme,
  applyThemeToDocument,
  persistTheme,
  THEME_STORAGE_KEY,
} from '@/lib/theme';

describe('lib/theme', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = '';
    delete document.documentElement.dataset.theme;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('isTheme', () => {
    it('accepts valid theme values', () => {
      expect(isTheme('light')).toBe(true);
      expect(isTheme('dark')).toBe(true);
      expect(isTheme('system')).toBe(true);
    });

    it('rejects invalid values', () => {
      expect(isTheme('auto')).toBe(false);
      expect(isTheme(null)).toBe(false);
      expect(isTheme(undefined)).toBe(false);
      expect(isTheme('')).toBe(false);
    });
  });

  describe('resolveTheme', () => {
    it('returns explicit light and dark themes regardless of system preference', () => {
      expect(resolveTheme('light', true)).toBe('light');
      expect(resolveTheme('light', false)).toBe('light');
      expect(resolveTheme('dark', true)).toBe('dark');
      expect(resolveTheme('dark', false)).toBe('dark');
    });

    it('follows system preference when theme is system', () => {
      expect(resolveTheme('system', true)).toBe('dark');
      expect(resolveTheme('system', false)).toBe('light');
    });
  });

  describe('getSystemPrefersDark', () => {
    it('returns true when matchMedia reports prefers-color-scheme: dark matches', () => {
      vi.spyOn(window, 'matchMedia').mockReturnValue({
        matches: true,
      } as MediaQueryList);

      expect(getSystemPrefersDark()).toBe(true);
    });

    it('returns false when matchMedia reports prefers-color-scheme: dark does not match', () => {
      vi.spyOn(window, 'matchMedia').mockReturnValue({
        matches: false,
      } as MediaQueryList);

      expect(getSystemPrefersDark()).toBe(false);
    });
  });

  describe('getStoredTheme', () => {
    it('returns system by default when no theme is stored', () => {
      expect(getStoredTheme()).toBe('system');
    });

    it('returns stored valid theme from localStorage', () => {
      localStorage.setItem(THEME_STORAGE_KEY, 'dark');
      expect(getStoredTheme()).toBe('dark');

      localStorage.setItem(THEME_STORAGE_KEY, 'light');
      expect(getStoredTheme()).toBe('light');
    });

    it('falls back to system when invalid value is in localStorage', () => {
      localStorage.setItem(THEME_STORAGE_KEY, 'invalid-theme');
      expect(getStoredTheme()).toBe('system');
    });
  });

  describe('applyThemeToDocument', () => {
    it('applies dark class and dataset theme to documentElement', () => {
      const resolved = applyThemeToDocument('dark');
      expect(resolved).toBe('dark');
      expect(document.documentElement.classList.contains('dark')).toBe(true);
      expect(document.documentElement.dataset.theme).toBe('dark');
    });

    it('removes dark class for light theme', () => {
      document.documentElement.classList.add('dark');
      const resolved = applyThemeToDocument('light');
      expect(resolved).toBe('light');
      expect(document.documentElement.classList.contains('dark')).toBe(false);
      expect(document.documentElement.dataset.theme).toBe('light');
    });

    it('resolves system theme using prefers-color-scheme', () => {
      vi.spyOn(window, 'matchMedia').mockReturnValue({
        matches: true,
      } as MediaQueryList);

      const resolved = applyThemeToDocument('system');
      expect(resolved).toBe('dark');
      expect(document.documentElement.classList.contains('dark')).toBe(true);
      expect(document.documentElement.dataset.theme).toBe('system');
    });
  });

  describe('persistTheme', () => {
    it('saves valid themes to localStorage', () => {
      persistTheme('dark');
      expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');

      persistTheme('system');
      expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('system');
    });

    it('ignores invalid themes', () => {
      persistTheme('invalid' as any);
      expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
    });
  });
});
