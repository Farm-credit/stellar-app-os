'use client';

import React from 'react';
import { useCurrency } from '@/contexts/CurrencyContext';

interface PriceDisplayProps {
  amountInUsd: number;
  showOriginalUsd?: boolean;
  className?: string;
}

export function PriceDisplay({
  amountInUsd,
  showOriginalUsd = false,
  className = '',
}: PriceDisplayProps) {
  const { formatPrice, currentCurrency } = useCurrency();

  const formattedLocal = formatPrice(amountInUsd);

  return (
    <span className={`inline-flex items-baseline gap-1.5 font-bold ${className}`}>
      <span>{formattedLocal}</span>
      {showOriginalUsd && currentCurrency !== 'USD' && (
        <span className="text-xs font-normal text-muted-foreground">
          (${amountInUsd.toFixed(2)} USD)
        </span>
      )}
    </span>
  );
}
