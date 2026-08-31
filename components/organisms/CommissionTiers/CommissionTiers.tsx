'use client';

import { Check, TrendingUp } from 'lucide-react';
import { Card, CardContent } from '@/components/molecules/Card';
import { Badge } from '@/components/atoms/Badge';
import { Text } from '@/components/atoms/Text';
import { cn } from '@/lib/utils';
import type { AffiliateCommissionTier } from '@/lib/types/affiliate';

interface CommissionTiersProps {
  tiers: AffiliateCommissionTier[];
  activeTierId?: string;
}

/** The 10–25% commission-band catalogue shown on the affiliate page. */
export function CommissionTiers({ tiers, activeTierId }: CommissionTiersProps) {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
      {tiers.map((tier) => {
        const isActive = tier.id === activeTierId;
        return (
          <Card
            key={tier.id}
            className={cn(
              'relative flex flex-col overflow-hidden rounded-2xl border transition-all',
              isActive
                ? 'border-stellar-green/40 shadow-lg shadow-stellar-green/10 ring-1 ring-stellar-green/30'
                : 'border-stellar-blue/10'
            )}
          >
            {isActive && (
              <div className="absolute right-3 top-3">
                <Badge variant="success">Your tier</Badge>
              </div>
            )}
            <CardContent className="flex flex-1 flex-col p-6">
              <div className="mb-3 flex items-center gap-2">
                <TrendingUp
                  className={cn('h-4 w-4', isActive ? 'text-stellar-green' : 'text-stellar-blue')}
                  aria-hidden
                />
                <Text className="font-semibold">{tier.name}</Text>
              </div>
              <div className="mb-1 text-4xl font-black tracking-tight text-stellar-blue">
                {tier.commissionRate}%
              </div>
              <Text variant="small" className="mb-4 text-muted-foreground">
                commission on referred sponsors
              </Text>
              <div className="mb-4 rounded-lg bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
                {tier.monthlyVolumeMinUsdc === 0
                  ? 'From your first referral'
                  : tier.monthlyVolumeMaxUsdc === null
                    ? `> $${tier.monthlyVolumeMinUsdc.toLocaleString()}/mo volume`
                    : `$${tier.monthlyVolumeMinUsdc.toLocaleString()}–$${tier.monthlyVolumeMaxUsdc.toLocaleString()}/mo`}
              </div>
              <ul className="mt-auto space-y-2">
                {tier.perks.map((perk) => (
                  <li key={perk} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-stellar-green" aria-hidden />
                    {perk}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
