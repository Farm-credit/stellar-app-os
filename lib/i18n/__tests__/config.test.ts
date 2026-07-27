import { afterEach, describe, expect, it } from 'vitest';
import i18n, { LANGUAGE_LABELS, SUPPORTED_LANGUAGES } from '../config';

describe('i18n configuration', () => {
  afterEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('registers exactly the four required languages', () => {
    expect(SUPPORTED_LANGUAGES).toEqual(['en', 'ha', 'fr', 'es']);
    expect(Object.keys(LANGUAGE_LABELS)).toEqual(['en', 'ha', 'fr', 'es']);
  });

  it.each([
    ['en', 'Home'],
    ['ha', 'Gida'],
    ['fr', 'Accueil'],
    ['es', 'Inicio'],
  ] as const)('loads the %s translation resources', async (language, expectedHomeLabel) => {
    await i18n.changeLanguage(language);

    expect(i18n.t('nav.home')).toBe(expectedHomeLabel);
    expect(document.documentElement.lang).not.toBe('pt');
  });

  it('falls back to English for unsupported languages', async () => {
    await i18n.changeLanguage('de');

    expect(i18n.t('nav.home')).toBe('Home');
  });
});
