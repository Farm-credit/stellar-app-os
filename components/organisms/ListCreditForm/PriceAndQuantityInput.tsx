// Copyright 2024 Farm-credit Contributors
// Licensed under the Apache License, Version 2.0
'use client';

import { useId } from 'react';
import { Text } from '@/components/atoms/Text';
import { cn } from '@/lib/utils';
import type { Credit } from '@/lib/types/listing';

export interface PriceAndQuantityInputProps {
  /** Currently selected credit — used to cap the max quantity. */
  selectedCredit: Credit | null;
  /** Current quantity value (metric tons). */
  quantity: number;
  /** Current price per ton value (USD / XLM). */
  pricePerTon: number;
  /** Currency label shown next to the price input. Defaults to "USD". */
  currency?: string;
  /** Called whenever quantity changes. */
  onQuantityChange: (value: number) => void;
  /** Called whenever pricePerTon changes. */
  onPriceChange: (value: number) => void;
  /** Optional validation errors. */
  quantityError?: string;
  priceError?: string;
}

const PLATFORM_FEE_RATE = 0.025; // 2.5 %

/**
 * PriceAndQuantityInput
 *
 * A single, cohesive form section that combines:
 * - quantity of carbon credits to list (metric tons)
 * - price per metric ton
 * - live financial summary (gross, platform fee, net to farmer)
 *
 * Designed to be embedded inside `ListCreditForm` as the dedicated
 * step where the seller specifies listing terms.
 */
export function PriceAndQuantityInput({
  selectedCredit,
  quantity,
  pricePerTon,
  currency = 'USD',
  onQuantityChange,
  onPriceChange,
  quantityError,
  priceError,
}: PriceAndQuantityInputProps) {
  const quantityId = useId();
  const priceId = useId();

  const maxQuantity = selectedCredit?.amount ?? 0;
  const gross = (quantity || 0) * (pricePerTon || 0);
  const fee = gross * PLATFORM_FEE_RATE;
  const net = gross - fee;

  const inputBase =
    'w-full rounded-lg border bg-background px-3.5 py-2.5 text-sm text-foreground ' +
    'focus:outline-none focus:ring-2 focus:ring-stellar-green/60 ' +
    'disabled:cursor-not-allowed disabled:opacity-50 transition-colors';

  return (
    <div className="space-y-6">
      {/* ── Quantity ── */}
      <div className="space-y-1.5">
        <label htmlFor={quantityId} className="block text-sm font-semibold text-foreground">
          Quantity{' '}
          <span className="font-normal text-muted-foreground">(metric tons of CO₂e)</span>
        </label>
        <div className="relative">
          <input
            id={quantityId}
            type="number"
            inputMode="numeric"
            min={1}
            max={maxQuantity || undefined}
            step={1}
            value={quantity || ''}
            onChange={(e) => onQuantityChange(Math.max(1, Number(e.target.value)))}
            placeholder="e.g. 500"
            aria-describedby={quantityError ? `${quantityId}-error` : undefined}
            className={cn(
              inputBase,
              quantityError ? 'border-red-400 focus:ring-red-400/50' : 'border-border',
            )}
          />
          {maxQuantity > 0 && (
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
              max {maxQuantity.toLocaleString()} t
            </span>
          )}
        </div>
        {quantityError ? (
          <p id={`${quantityId}-error`} role="alert" className="text-xs text-red-600 dark:text-red-400">
            {quantityError}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Total tCO₂e credits to list on the marketplace
          </p>
        )}
      </div>

      {/* ── Price per ton ── */}
      <div className="space-y-1.5">
        <label htmlFor={priceId} className="block text-sm font-semibold text-foreground">
          Price per ton{' '}
          <span className="font-normal text-muted-foreground">({currency})</span>
        </label>
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground select-none">
            $
          </span>
          <input
            id={priceId}
            type="number"
            inputMode="decimal"
            min={0.01}
            step={0.01}
            value={pricePerTon || ''}
            onChange={(e) => onPriceChange(Math.max(0.01, Number(e.target.value)))}
            placeholder="0.00"
            aria-describedby={priceError ? `${priceId}-error` : undefined}
            className={cn(
              inputBase,
              'pl-7',
              priceError ? 'border-red-400 focus:ring-red-400/50' : 'border-border',
            )}
          />
        </div>
        {priceError ? (
          <p id={`${priceId}-error`} role="alert" className="text-xs text-red-600 dark:text-red-400">
            {priceError}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Asking price per metric ton — set competitively with the current market
          </p>
        )}
      </div>

      {/* ── Financial summary ── */}
      {quantity > 0 && pricePerTon > 0 && (
        <div className="rounded-xl border border-border/60 bg-muted/30 p-4 space-y-2.5">
          <Text variant="small" as="h4" className="font-semibold text-foreground">
            Financial summary
          </Text>

          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <dt>
                {quantity.toLocaleString()} t × ${pricePerTon.toFixed(2)}
              </dt>
              <dd>${gross.toLocaleString(undefined, { minimumFractionDigits: 2 })}</dd>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <dt>Platform fee (2.5%)</dt>
              <dd>−${fee.toLocaleString(undefined, { minimumFractionDigits: 2 })}</dd>
            </div>
            <div className="flex justify-between font-semibold text-foreground border-t border-border/40 pt-2">
              <dt>Estimated net to farmer</dt>
              <dd className="text-stellar-green">
                ${net.toLocaleString(undefined, { minimumFractionDigits: 2 })} {currency}
              </dd>
            </div>
          </dl>
        </div>
      )}
    </div>
  );
}

PriceAndQuantityInput.displayName = 'PriceAndQuantityInput';
