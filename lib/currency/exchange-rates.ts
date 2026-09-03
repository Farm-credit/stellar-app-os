export type CurrencyCode = 'USD' | 'EUR' | 'GBP' | 'INR' | 'JPY' | 'CNY' | 'AED';

export interface CurrencyConfig {
  code: CurrencyCode;
  symbol: string;
  name: string;
  flagEmoji: string;
  locale: string;
}

export const SUPPORTED_CURRENCIES: Record<CurrencyCode, CurrencyConfig> = {
  USD: { code: 'USD', symbol: '$', name: 'US Dollar', flagEmoji: '🇺🇸', locale: 'en-US' },
  EUR: { code: 'EUR', symbol: '€', name: 'Euro', flagEmoji: '🇪🇺', locale: 'de-DE' },
  GBP: { code: 'GBP', symbol: '£', name: 'British Pound', flagEmoji: '🇬🇧', locale: 'en-GB' },
  INR: { code: 'INR', symbol: '₹', name: 'Indian Rupee', flagEmoji: '🇮🇳', locale: 'en-IN' },
  JPY: { code: 'JPY', symbol: '¥', name: 'Japanese Yen', flagEmoji: '🇯🇵', locale: 'ja-JP' },
  CNY: { code: 'CNY', symbol: '¥', name: 'Chinese Yuan', flagEmoji: '🇨🇳', locale: 'zh-CN' },
  AED: { code: 'AED', symbol: 'AED', name: 'UAE Dirham', flagEmoji: '🇦🇪', locale: 'ar-AE' },
};

/**
 * Fallback static exchange rates relative to 1.0 USD
 */
export const FALLBACK_EXCHANGE_RATES: Record<CurrencyCode, number> = {
  USD: 1.0,
  EUR: 0.92,
  GBP: 0.79,
  INR: 83.45,
  JPY: 155.20,
  CNY: 7.23,
  AED: 3.67,
};

let cachedRates: Record<CurrencyCode, number> | null = null;
let lastCacheFetchTime = 0;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes cache

/**
 * Fetch live exchange rates with caching & fallback mechanism
 */
export async function getLiveExchangeRates(): Promise<Record<CurrencyCode, number>> {
  const now = Date.now();
  if (cachedRates && now - lastCacheFetchTime < CACHE_TTL_MS) {
    return cachedRates;
  }

  try {
    const res = await fetch('https://api.exchangerate-api.com/v4/latest/USD', {
      next: { revalidate: 600 },
    });

    if (res.ok) {
      const data = await res.json();
      const rates: Record<CurrencyCode, number> = {
        USD: 1.0,
        EUR: data.rates?.EUR ?? FALLBACK_EXCHANGE_RATES.EUR,
        GBP: data.rates?.GBP ?? FALLBACK_EXCHANGE_RATES.GBP,
        INR: data.rates?.INR ?? FALLBACK_EXCHANGE_RATES.INR,
        JPY: data.rates?.JPY ?? FALLBACK_EXCHANGE_RATES.JPY,
        CNY: data.rates?.CNY ?? FALLBACK_EXCHANGE_RATES.CNY,
        AED: data.rates?.AED ?? FALLBACK_EXCHANGE_RATES.AED,
      };

      cachedRates = rates;
      lastCacheFetchTime = now;
      return rates;
    }
  } catch (error) {
    // Silent fallback to static rates
  }

  cachedRates = FALLBACK_EXCHANGE_RATES;
  lastCacheFetchTime = now;
  return FALLBACK_EXCHANGE_RATES;
}

/**
 * Convert USD price to target local currency using rate matrix
 */
export function convertUsdToCurrency(
  amountInUsd: number,
  targetCurrency: CurrencyCode,
  rates: Record<CurrencyCode, number> = FALLBACK_EXCHANGE_RATES
): number {
  const rate = rates[targetCurrency] ?? 1.0;
  return amountInUsd * rate;
}

/**
 * Format currency value with symbol and locale
 */
export function formatRegionalCurrency(
  amount: number,
  currencyCode: CurrencyCode
): string {
  const config = SUPPORTED_CURRENCIES[currencyCode] || SUPPORTED_CURRENCIES.USD;
  try {
    return new Intl.NumberFormat(config.locale, {
      style: 'currency',
      currency: config.code,
      maximumFractionDigits: currencyCode === 'JPY' ? 0 : 2,
      minimumFractionDigits: currencyCode === 'JPY' ? 0 : 2,
    }).format(amount);
  } catch (e) {
    return `${config.symbol}${amount.toFixed(currencyCode === 'JPY' ? 0 : 2)}`;
  }
}
