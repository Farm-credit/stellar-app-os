import { describe, expect, it } from 'vitest';
import { isTheme, resolveTheme } from '@/lib/theme';

describe('lib/theme', () => {
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
    });
  });

  describe('resolveTheme', () => {
    it('returns explicit light and dark themes', () => {
      expect(resolveTheme('light', true)).toBe('light');
      expect(resolveTheme('dark', false)).toBe('dark');
    });

    it('follows system preference for system theme', () => {
      expect(resolveTheme('system', true)).toBe('dark');
      expect(resolveTheme('system', false)).toBe('light');
    });
  });
});
