'use client';

import React from 'react';
import { useCurrency } from '@/contexts/CurrencyContext';
import { CurrencyCode } from '@/lib/currency/exchange-rates';

export function CurrencySelector({ className = '' }: { className?: string }) {
  const { currentCurrency, setCurrency, supportedCurrencies, isLoadingRates } = useCurrency();

  return (
    <div className={`relative inline-block ${className}`}>
      <select
        value={currentCurrency}
        onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
        disabled={isLoadingRates}
        aria-label="Select Regional Currency"
        className="appearance-none bg-background hover:bg-muted border border-border text-foreground font-semibold text-xs py-1.5 px-3 pr-8 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-colors cursor-pointer disabled:opacity-50"
      >
        {supportedCurrencies.map((c) => (
          <option key={c.code} value={c.code}>
            {c.flagEmoji} {c.code} ({c.symbol})
          </option>
        ))}
      </select>
      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-muted-foreground text-xs">
        ▼
      </div>
    </div>
  );
}
