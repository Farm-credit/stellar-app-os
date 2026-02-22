"use client";

import { Text } from "@/components/atoms/Text";
import { LoadingSpinner } from "@/components/atoms/LoadingSpinner/LoadingSpinner";
import { CreditCard } from "@/components/molecules/CreditCard/CreditCard";
import type { Credit } from "@/lib/types/listing";

interface CreditSelectorProps {
  credits: Credit[];
  selectedCredit: Credit | null;
  onSelect: (credit: Credit) => void;
  isLoading?: boolean;
  error?: string;
}

export function CreditSelector({
  credits,
  selectedCredit,
  onSelect,
  isLoading = false,
  error
}: CreditSelectorProps) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        <label htmlFor="credit-selector" className="block text-sm font-medium">
          Select Credit to List
        </label>
        <div className="flex items-center justify-center p-8 border border-dashed border-border rounded-lg">
          <div className="flex items-center gap-3 text-muted-foreground">
            <LoadingSpinner size="md" />
            <Text variant="small" as="span">Loading your credits...</Text>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-3">
        <label htmlFor="credit-selector" className="block text-sm font-medium">
          Select Credit to List
        </label>
        <div className="p-4 border border-red-200 dark:border-red-800 rounded-lg bg-red-50 dark:bg-red-900/20">
          <Text variant="small" as="p" className="text-red-600 dark:text-red-400">
            {error}
          </Text>
        </div>
      </div>
    );
  }

  if (credits.length === 0) {
    return (
      <div className="space-y-3">
        <label htmlFor="credit-selector" className="block text-sm font-medium">
          Select Credit to List
        </label>
        <div className="p-8 border border-dashed border-border rounded-lg text-center">
          <div className="space-y-3">
            <div className="w-12 h-12 mx-auto bg-muted rounded-full flex items-center justify-center">
              <svg className="w-6 h-6 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <Text variant="small" as="h3" className="font-medium">
                No Credits Available
              </Text>
              <Text variant="small" as="p" className="text-muted-foreground mt-1">
                You don't have any carbon credits in your wallet to list.
              </Text>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <label htmlFor="credit-selector" className="block text-sm font-medium">
        Select Credit to List
      </label>
      
      <div className="grid gap-3" role="radiogroup" aria-labelledby="credit-selector">
        {credits.map((credit) => (
          <CreditCard
            key={credit.id}
            credit={credit}
            isSelected={selectedCredit?.id === credit.id}
            onClick={() => onSelect(credit)}
            showAmount
            className="transition-all"
          />
        ))}
      </div>

      {selectedCredit && (
        <div className="p-3 bg-stellar-blue/5 dark:bg-stellar-blue/10 border border-stellar-blue/20 rounded-lg">
          <Text variant="small" as="p" className="text-stellar-blue dark:text-stellar-blue-light">
            ✓ Selected: {selectedCredit.type} ({selectedCredit.amount} credits available)
          </Text>
        </div>
      )}
    </div>
  );
}