import { renderHook, act, cleanup } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import i18n from '@/lib/i18n/config';
import { useAppTranslation } from './useTranslation';

describe('useAppTranslation', () => {
  beforeEach(async () => {
    await act(async () => {
      await i18n.changeLanguage('en');
    });
  });

  afterEach(async () => {
    // Unmount first so restoring the language does not update a mounted hook.
    cleanup();
    await act(async () => {
      await i18n.changeLanguage('en');
    });
  });

  it('returns the active language and the supported languages', async () => {
    const { result } = renderHook(() => useAppTranslation());
    await act(async () => {});

    expect(result.current.language).toBe('en');
    expect(result.current.supportedLanguages).toEqual(
      expect.arrayContaining(['en', 'ha', 'fr', 'es'])
    );
    expect(typeof result.current.t).toBe('function');
  });

  it('translates keys for the active language', async () => {
    const { result } = renderHook(() => useAppTranslation());

    expect(result.current.t('nav.home')).toBe('Home');

    await act(async () => {
      await result.current.changeLanguage('fr');
    });

    expect(result.current.t('nav.home')).toBe('Accueil');
  });

  it('changeLanguage updates i18n and the document lang attribute', async () => {
    const { result } = renderHook(() => useAppTranslation());

    await act(async () => {
      await result.current.changeLanguage('es');
    });

    expect(result.current.language).toBe('es');
    expect(document.documentElement.lang).toBe('es');
    expect(result.current.isRTLLanguage).toBe(false);
  });

  it('falls back to English for an unsupported detected language', async () => {
    await act(async () => {
      await i18n.changeLanguage('de');
    });
    const { result } = renderHook(() => useAppTranslation());
    await act(async () => {});

    expect(result.current.language).toBe('en');
  });

  it('exposes locale-aware number, currency and date formatters', async () => {
    const { result } = renderHook(() => useAppTranslation());
    await act(async () => {});

    expect(result.current.formatNumber(1234.5)).toMatch(/1[,.]?234/);
    expect(result.current.formatCurrency(10, 'USD')).toMatch(/\$/);
    expect(
      result.current.formatDate(new Date('2024-01-15T00:00:00Z'), { year: 'numeric' })
    ).toMatch(/2024/);
  });
});
