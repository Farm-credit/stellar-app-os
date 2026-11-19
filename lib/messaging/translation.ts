/**
 * Automatic translation for sponsor ↔ field team messages (#1686).
 *
 * The provider is pluggable. The default one talks to a LibreTranslate-compatible
 * endpoint configured with `TRANSLATION_API_URL` (and optionally
 * `TRANSLATION_API_KEY`). When nothing is configured, or a call fails, the
 * message is still delivered and flagged as untranslated so the reader sees the
 * original text.
 */
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from '@/lib/i18n/config';
import type { TranslationStatus } from '@/lib/types/field-messaging';

export interface TranslationProvider {
  translate(text: string, from: SupportedLanguage, to: SupportedLanguage): Promise<string>;
}

export function isSupportedLanguage(value: unknown): value is SupportedLanguage {
  return typeof value === 'string' && (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}

/** LibreTranslate-compatible HTTP provider. */
export function createHttpTranslationProvider(options: {
  url: string;
  apiKey?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): TranslationProvider {
  const doFetch = options.fetchImpl ?? fetch;
  return {
    async translate(text, from, to) {
      const response = await doFetch(options.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          q: text,
          source: from,
          target: to,
          format: 'text',
          ...(options.apiKey ? { api_key: options.apiKey } : {}),
        }),
        signal: AbortSignal.timeout(options.timeoutMs ?? 5_000),
      });
      if (!response.ok) {
        throw new Error(`Translation request failed with status ${response.status}`);
      }
      const data = (await response.json()) as { translatedText?: unknown };
      if (typeof data.translatedText !== 'string' || data.translatedText.trim() === '') {
        throw new Error('Translation response had no translatedText');
      }
      return data.translatedText;
    },
  };
}

let providerOverride: TranslationProvider | null | undefined;

/** Test hook: replace the provider (pass `undefined` to go back to the env-based one). */
export function setTranslationProviderForTest(provider: TranslationProvider | null | undefined) {
  providerOverride = provider;
}

export function getTranslationProvider(): TranslationProvider | null {
  if (providerOverride !== undefined) return providerOverride;
  const url = process.env.TRANSLATION_API_URL?.trim();
  if (!url) return null;
  return createHttpTranslationProvider({ url, apiKey: process.env.TRANSLATION_API_KEY?.trim() });
}

export interface TranslationOutcome {
  status: TranslationStatus;
  text: string | null;
}

/** Translates `text` between languages; never throws. */
export async function translateText(
  text: string,
  from: SupportedLanguage,
  to: SupportedLanguage
): Promise<TranslationOutcome> {
  if (from === to) return { status: 'not_needed', text: null };

  const provider = getTranslationProvider();
  if (!provider) return { status: 'unavailable', text: null };

  try {
    return { status: 'translated', text: await provider.translate(text, from, to) };
  } catch (error) {
    console.error('[field-messaging] translation failed:', error);
    return { status: 'unavailable', text: null };
  }
}

/** Hausa-speaking regions covered by the field teams; everywhere else defaults to English. */
const HAUSA_REGIONS = [
  'kano',
  'kaduna',
  'sokoto',
  'katsina',
  'zamfara',
  'kebbi',
  'bauchi',
  'gombe',
  'jigawa',
];
const FRENCH_REGIONS = [
  'senegal',
  'mali',
  'burkina',
  'ivory coast',
  "côte d'ivoire",
  'benin',
  'togo',
  'niger,',
  'cameroon',
];

/** Language the field team for a region works in. */
export function fieldTeamLanguageForRegion(region: string): SupportedLanguage {
  const normalized = region.toLowerCase();
  if (HAUSA_REGIONS.some((place) => normalized.includes(place))) return 'ha';
  if (FRENCH_REGIONS.some((place) => normalized.includes(place))) return 'fr';
  return 'en';
}
