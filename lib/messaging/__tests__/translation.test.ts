import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createHttpTranslationProvider,
  fieldTeamLanguageForRegion,
  isSupportedLanguage,
  setTranslationProviderForTest,
  translateText,
} from '../translation';

afterEach(() => {
  setTranslationProviderForTest(undefined);
  vi.restoreAllMocks();
});

describe('createHttpTranslationProvider', () => {
  it('posts a LibreTranslate-style request and returns the translated text', async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ translatedText: 'Sannu' }), { status: 200 }))
    );
    const provider = createHttpTranslationProvider({
      url: 'https://translate.example/translate',
      apiKey: 'secret',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(provider.translate('Hello', 'en', 'ha')).resolves.toBe('Sannu');

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://translate.example/translate');
    expect(JSON.parse(init.body as string)).toEqual({
      q: 'Hello',
      source: 'en',
      target: 'ha',
      format: 'text',
      api_key: 'secret',
    });
  });

  it('throws on a non-2xx response', async () => {
    const provider = createHttpTranslationProvider({
      url: 'https://translate.example/translate',
      fetchImpl: (() =>
        Promise.resolve(new Response('nope', { status: 500 }))) as unknown as typeof fetch,
    });
    await expect(provider.translate('Hello', 'en', 'ha')).rejects.toThrow(/500/);
  });

  it('throws when the response has no translated text', async () => {
    const provider = createHttpTranslationProvider({
      url: 'https://translate.example/translate',
      fetchImpl: (() =>
        Promise.resolve(new Response('{}', { status: 200 }))) as unknown as typeof fetch,
    });
    await expect(provider.translate('Hello', 'en', 'ha')).rejects.toThrow(/translatedText/);
  });
});

describe('translateText', () => {
  it('does nothing when both sides use the same language', async () => {
    const translate = vi.fn();
    setTranslationProviderForTest({ translate });

    await expect(translateText('Hello', 'en', 'en')).resolves.toEqual({
      status: 'not_needed',
      text: null,
    });
    expect(translate).not.toHaveBeenCalled();
  });

  it('translates between different languages', async () => {
    setTranslationProviderForTest({
      translate: (text, from, to) => Promise.resolve(`[${from}>${to}] ${text}`),
    });

    await expect(translateText('Hello', 'en', 'ha')).resolves.toEqual({
      status: 'translated',
      text: '[en>ha] Hello',
    });
  });

  it('reports unavailable when no provider is configured', async () => {
    setTranslationProviderForTest(null);

    await expect(translateText('Hello', 'en', 'ha')).resolves.toEqual({
      status: 'unavailable',
      text: null,
    });
  });

  it('reports unavailable instead of throwing when the provider fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    setTranslationProviderForTest({
      translate: () => Promise.reject(new Error('boom')),
    });

    await expect(translateText('Hello', 'en', 'ha')).resolves.toEqual({
      status: 'unavailable',
      text: null,
    });
  });
});

describe('fieldTeamLanguageForRegion', () => {
  it('maps northern Nigerian regions to Hausa', () => {
    expect(fieldTeamLanguageForRegion('Kano, Nigeria')).toBe('ha');
    expect(fieldTeamLanguageForRegion('Sokoto, Nigeria')).toBe('ha');
  });

  it('maps francophone regions to French', () => {
    expect(fieldTeamLanguageForRegion('Dakar, Senegal')).toBe('fr');
  });

  it('defaults to English elsewhere', () => {
    expect(fieldTeamLanguageForRegion('Nairobi, Kenya')).toBe('en');
    expect(fieldTeamLanguageForRegion('Greater Accra, Ghana')).toBe('en');
  });
});

describe('isSupportedLanguage', () => {
  it('accepts only supported language codes', () => {
    expect(isSupportedLanguage('ha')).toBe(true);
    expect(isSupportedLanguage('de')).toBe(false);
    expect(isSupportedLanguage(undefined)).toBe(false);
  });
});
