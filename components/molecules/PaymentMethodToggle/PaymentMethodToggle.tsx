'use client';

import { CreditCard, Wallet } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DonationPaymentMethod } from '@/lib/types/donation-payment';

interface PaymentMethodToggleProps {
  selected: DonationPaymentMethod;
  onChange: (_method: DonationPaymentMethod) => void; // eslint-disable-line no-unused-vars
  disabled?: boolean;
}

const methods: { id: DonationPaymentMethod; label: string; icon: typeof CreditCard }[] = [
  { id: 'card', label: 'Credit Card', icon: CreditCard },
  { id: 'stellar', label: 'Stellar (USDC)', icon: Wallet },
];

export function PaymentMethodToggle({ selected, onChange, disabled }: PaymentMethodToggleProps) {
  return (
    <div
      role="radiogroup"
      aria-label="Payment method"
      className="flex rounded-lg border border-border bg-muted/30 p-1"
    >
      {methods.map((method) => {
        const Icon = method.icon;
        const isSelected = selected === method.id;

        return (
          <button
            key={method.id}
            type="button"
            role="radio"
            aria-checked={isSelected}
            aria-label={`Pay with ${method.label}`}
            disabled={disabled}
            onClick={() => onChange(method.id)}
            className={cn(
              'flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-3 text-sm font-medium transition-all focus:outline-none focus:ring-2 focus:ring-stellar-blue/50 focus:ring-offset-1',
              isSelected
                ? 'border border-stellar-blue bg-stellar-blue/10 text-stellar-blue shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
              disabled && 'cursor-not-allowed opacity-50'
            )}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            <span>{method.label}</span>
          </button>
        );
      })}
    </div>
  );
}
