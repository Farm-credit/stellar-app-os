'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  CurrencyCode,
  SUPPORTED_CURRENCIES,
  FALLBACK_EXCHANGE_RATES,
  convertUsdToCurrency,
  formatRegionalCurrency,
  CurrencyConfig,
} from '@/lib/currency/exchange-rates';

interface CurrencyContextType {
  currentCurrency: CurrencyCode;
  currencyConfig: CurrencyConfig;
  rates: Record<CurrencyCode, number>;
  isLoadingRates: boolean;
  setCurrency: (code: CurrencyCode) => void;
  convertPrice: (amountInUsd: number) => number;
  formatPrice: (amountInUsd: number) => string;
  supportedCurrencies: CurrencyConfig[];
}

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined);

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const [currentCurrency, setCurrentCurrencyState] = useState<CurrencyCode>('USD');
  const [rates, setRates] = useState<Record<CurrencyCode, number>>(FALLBACK_EXCHANGE_RATES);
  const [isLoadingRates, setIsLoadingRates] = useState<boolean>(true);

  // Load user saved currency preference from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('user_regional_currency') as CurrencyCode;
      if (saved && SUPPORTED_CURRENCIES[saved]) {
        setCurrentCurrencyState(saved);
      }
    } catch (e) {
      // Storage access error fallback
    }
  }, []);

  // Fetch live exchange rates on mount
  useEffect(() => {
    let isMounted = true;
    async function fetchRates() {
      try {
        const res = await fetch('/api/currency/rates');
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.rates && isMounted) {
            setRates(data.rates);
          }
        }
      } catch (error) {
        // Silent fallback to static rates
      } finally {
        if (isMounted) setIsLoadingRates(false);
      }
    }
    fetchRates();
    return () => {
      isMounted = false;
    };
  }, []);

  const setCurrency = useCallback((code: CurrencyCode) => {
    if (SUPPORTED_CURRENCIES[code]) {
      setCurrentCurrencyState(code);
      try {
        localStorage.setItem('user_regional_currency', code);
      } catch (e) {
        // Storage access error fallback
      }
    }
  }, []);

  const convertPrice = useCallback(
    (amountInUsd: number): number => {
      return convertUsdToCurrency(amountInUsd, currentCurrency, rates);
    },
    [currentCurrency, rates]
  );

  const formatPrice = useCallback(
    (amountInUsd: number): string => {
      const converted = convertUsdToCurrency(amountInUsd, currentCurrency, rates);
      return formatRegionalCurrency(converted, currentCurrency);
    },
    [currentCurrency, rates]
  );

  const currencyConfig = SUPPORTED_CURRENCIES[currentCurrency];
  const supportedCurrencies = Object.values(SUPPORTED_CURRENCIES);

  return (
    <CurrencyContext.Provider
      value={{
        currentCurrency,
        currencyConfig,
        rates,
        isLoadingRates,
        setCurrency,
        convertPrice,
        formatPrice,
        supportedCurrencies,
      }}
    >
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  const context = useContext(CurrencyContext);
  if (!context) {
    throw new Error('useCurrency must be used within a CurrencyProvider');
  }
  return context;
}
