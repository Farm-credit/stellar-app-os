'use client';

import { Trees, Mountain, CreditCard, Wallet } from 'lucide-react';
import { Card, CardHeader, CardContent, CardFooter } from '@/components/molecules/Card';
import { Text } from '@/components/atoms/Text';
import { Badge } from '@/components/atoms/Badge';
import {
  TREES_PER_DOLLAR,
  HECTARES_PER_DOLLAR,
  CO2_PER_DOLLAR,
  formatCurrency,
  formatNumber,
} from '@/lib/constants/donation';
import type { DonationPaymentMethod } from '@/lib/types/donation-payment';

interface OrderSummaryProps {
  amount: number;
  isMonthly: boolean;
  paymentMethod: DonationPaymentMethod;
}

export function OrderSummary({ amount, isMonthly, paymentMethod }: OrderSummaryProps) {
  const safeAmount = Math.min(amount, 1000000);
  const impact = {
    trees: Math.round(safeAmount * TREES_PER_DOLLAR),
    hectares: (safeAmount * HECTARES_PER_DOLLAR).toFixed(2),
    co2: (safeAmount * CO2_PER_DOLLAR).toFixed(1),
  };

  return (
    <Card className="border-border bg-card shadow-sm">
      <CardHeader className="pb-4">
        <Text variant="h3" className="text-lg font-semibold">
          Order Summary
        </Text>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Donation Amount */}
        <div className="flex items-center justify-between">
          <Text variant="body" className="text-muted-foreground">
            Donation
          </Text>
          <div className="flex items-center gap-2">
            <Text variant="body" className="font-semibold">
              {formatCurrency(amount)}
            </Text>
            <Badge variant={isMonthly ? 'default' : 'secondary'} className="text-xs">
              {isMonthly ? 'Monthly' : 'One-time'}
            </Badge>
          </div>
        </div>

        {/* Payment Method */}
        <div className="flex items-center justify-between">
          <Text variant="body" className="text-muted-foreground">
            Payment via
          </Text>
          <div className="flex items-center gap-1.5">
            {paymentMethod === 'card' ? (
              <CreditCard className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            ) : (
              <Wallet className="h-4 w-4 text-stellar-blue" aria-hidden="true" />
            )}
            <Text variant="small" className="font-medium">
              {paymentMethod === 'card' ? 'Credit Card' : 'Stellar (USDC)'}
            </Text>
          </div>
        </div>

        <div className="border-t border-border" aria-hidden="true" />

        {/* Impact Preview */}
        <div className="space-y-3">
          <Text
            variant="small"
            className="font-medium text-muted-foreground uppercase tracking-wide"
          >
            Your Impact
          </Text>

          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-stellar-green/10">
              <Trees className="h-4 w-4 text-stellar-green" aria-hidden="true" />
            </div>
            <div>
              <Text variant="body" className="font-semibold text-stellar-green">
                {formatNumber(impact.trees)}
              </Text>
              <Text variant="small" className="text-muted-foreground">
                trees planted
              </Text>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-stellar-blue/10">
              <Mountain className="h-4 w-4 text-stellar-blue" aria-hidden="true" />
            </div>
            <div>
              <Text variant="body" className="font-semibold text-stellar-blue">
                {impact.hectares}
              </Text>
              <Text variant="small" className="text-muted-foreground">
                hectares restored
              </Text>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted">
              <Text className="text-xs font-bold" aria-hidden="true">
                CO₂
              </Text>
            </div>
            <div>
              <Text variant="body" className="font-semibold">
                {impact.co2}t
              </Text>
              <Text variant="small" className="text-muted-foreground">
                CO2 offset / year
              </Text>
            </div>
          </div>
        </div>
      </CardContent>

      <CardFooter className="border-t border-border pt-4">
        <div className="flex w-full items-center justify-between">
          <Text variant="body" className="font-semibold">
            Total
          </Text>
          <Text variant="h3" className="text-xl font-bold text-stellar-blue">
            {formatCurrency(amount)}
          </Text>
        </div>
      </CardFooter>
    </Card>
  );
}
