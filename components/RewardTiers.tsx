'use client';

import React from 'react';
import type { RewardTier } from '../lib/referrals';

interface RewardTiersProps {
  tiers: RewardTier[];
}

export default function RewardTiers({ tiers }: RewardTiersProps) {
  return (
    <section aria-labelledby="tiers-heading" className="mb-6">
      <h2 id="tiers-heading" className="text-xl font-semibold mb-3">
        Reward Tiers
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {tiers.map((tier) => (
          <div key={tier.level} className="rounded-lg border border-gray-200 p-4">
            <h3 className="text-lg font-bold mb-1">{tier.level}</h3>
            <p className="text-sm text-gray-500 mb-2">{tier.threshold}+ referrals</p>
            <p className="text-sm">{tier.rewardDescription}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
