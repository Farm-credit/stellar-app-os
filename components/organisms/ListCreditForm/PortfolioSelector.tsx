// Copyright 2024 Farm-credit Contributors
// Licensed under the Apache License, Version 2.0
'use client';

import { cn } from '@/lib/utils';
import { Text } from '@/components/atoms/Text';
import { Badge } from '@/components/atoms/Badge';
import type { Credit } from '@/lib/types/listing';

interface PortfolioSelectorProps {
  credits: Credit[];
  selectedCredit: Credit | null;
  onSelect: (credit: Credit) => void;
  isLoading?: boolean;
  error?: string;
}

/** Maps a credit methodology string to a short badge label. */
function methodBadge(methodology: string): string {
  const map: Record<string, string> = {
    VCS: 'Verra VCS',
    CDM: 'Clean Dev. Mech.',
    'Gold Standard': 'Gold Standard',
    CAR: 'Climate Action Reserve',
    'Plan Vivo': 'Plan Vivo',
  };
  return map[methodology] ?? methodology;
}

/**
 * PortfolioSelector
 *
 * Renders the farmer's verified credit holdings as selectable cards.
 * Each card shows the credit type, vintage, available quantity, and
 * the verification / methodology standard so farmers can pick the
 * right batch before proceeding to price entry.
 */
export function PortfolioSelector({
  credits,
  selectedCredit,
  onSelect,
  isLoading = false,
  error,
}: PortfolioSelectorProps) {
  if (isLoading) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Loading portfolio">
        <Text variant="small" as="p" className="font-semibold text-foreground">
          Your Credit Portfolio
        </Text>
        {[1, 2].map((i) => (
          <div
            key={i}
            className="h-24 rounded-xl border border-border bg-muted/30 animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4">
        <Text variant="small" as="p" className="text-red-600 dark:text-red-400">
          {error}
        </Text>
      </div>
    );
  }

  if (credits.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-muted/20 p-8 text-center space-y-2">
        <svg
          className="mx-auto h-10 w-10 text-muted-foreground/50"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
        <Text variant="small" as="p" className="font-medium text-foreground">
          No credits in portfolio
        </Text>
        <Text variant="muted" as="p" className="text-xs">
          You have no verified carbon credits available to list. Credits appear here once they
          have been issued and verified to your wallet.
        </Text>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Text variant="small" as="p" className="font-semibold text-foreground">
        Select credits to list{' '}
        <span className="font-normal text-muted-foreground">({credits.length} available)</span>
      </Text>

      <div className="grid gap-3" role="radiogroup" aria-label="Credit portfolio">
        {credits.map((credit) => {
          const isSelected = selectedCredit?.id === credit.id;
          return (
            <button
              key={credit.id}
              role="radio"
              aria-checked={isSelected}
              onClick={() => onSelect(credit)}
              className={cn(
                'group w-full rounded-xl border p-4 text-left transition-all duration-150',
                'hover:border-stellar-green/60 hover:bg-stellar-green/5',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stellar-green/50',
                isSelected
                  ? 'border-stellar-green bg-stellar-green/5 shadow-sm'
                  : 'border-border bg-card',
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="text-sm font-semibold text-foreground truncate">
                      {credit.type}
                    </span>
                    <Badge
                      variant="secondary"
                      className="text-xs shrink-0"
                    >
                      Vintage {credit.vintage}
                    </Badge>
                  </div>

                  <p className="text-xs text-muted-foreground truncate mb-2">
                    {credit.metadata.projectName}
                    {credit.metadata.location ? ` · ${credit.metadata.location}` : ''}
                  </p>

                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 font-medium border border-emerald-200/60 dark:border-emerald-900/60">
                      {credit.metadata.verificationStandard
                        ? methodBadge(credit.metadata.methodology)
                        : credit.metadata.methodology}
                    </span>
                    <span className="text-muted-foreground">
                      {credit.amount.toLocaleString()} tCO₂e available
                    </span>
                  </div>
                </div>

                {/* Selection indicator */}
                <div
                  className={cn(
                    'mt-0.5 h-5 w-5 shrink-0 rounded-full border-2 flex items-center justify-center transition-colors',
                    isSelected
                      ? 'border-stellar-green bg-stellar-green'
                      : 'border-border group-hover:border-stellar-green/60',
                  )}
                  aria-hidden="true"
                >
                  {isSelected && (
                    <svg className="h-3 w-3 text-white" fill="currentColor" viewBox="0 0 12 12">
                      <path d="M10 3L5 8.5 2 5.5l-1 1 4 4 6-7-1-1z" />
                    </svg>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {selectedCredit && (
        <p className="text-xs text-stellar-green font-medium">
          ✓ Selected: {selectedCredit.type} — up to {selectedCredit.amount.toLocaleString()} tCO₂e
        </p>
      )}
    </div>
  );
}

PortfolioSelector.displayName = 'PortfolioSelector';
