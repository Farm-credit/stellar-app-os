import { describe, expect, it } from 'vitest';
import {
  FALLBACK_EXCHANGE_RATES,
  SUPPORTED_CURRENCIES,
  convertUsdToCurrency,
  formatRegionalCurrency,
} from './exchange-rates';

describe('currency exchange helpers', () => {
  it('converts a USD donation using the live-rate shape returned by the API', () => {
    const rates = { ...FALLBACK_EXCHANGE_RATES, EUR: 0.95 };

    expect(convertUsdToCurrency(25, 'EUR', rates)).toBe(23.75);
    expect(convertUsdToCurrency(25, 'USD', rates)).toBe(25);
  });

  it('supports every configured checkout currency', () => {
    for (const currency of Object.keys(SUPPORTED_CURRENCIES) as Array<
      keyof typeof SUPPORTED_CURRENCIES
    >) {
      expect(convertUsdToCurrency(10, currency, FALLBACK_EXCHANGE_RATES)).toBe(
        10 * FALLBACK_EXCHANGE_RATES[currency]
      );
    }
  });

  it('formats zero and fractional values with the currency locale', () => {
    expect(formatRegionalCurrency(0, 'EUR')).toContain('0');
    expect(formatRegionalCurrency(12.5, 'GBP')).toContain('12.50');
    expect(formatRegionalCurrency(1552, 'JPY')).toContain('1,552');
  });
});
