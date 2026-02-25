'use client';

import React from 'react';

interface StatsDisplayProps {
  referralsCount: number;
  totalEarnings: number;
}

export default function StatsDisplay({ referralsCount, totalEarnings }: StatsDisplayProps) {
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  });

  return (
    <section aria-labelledby="stats-heading" className="mb-6">
      <h2 id="stats-heading" className="text-xl font-semibold mb-3">
        Your Stats
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-lg border border-gray-200 p-4 text-center">
          <p className="text-sm text-gray-500">Referrals</p>
          <p className="text-3xl font-bold">{referralsCount}</p>
        </div>
        <div className="rounded-lg border border-gray-200 p-4 text-center">
          <p className="text-sm text-gray-500">Earnings</p>
          <p className="text-3xl font-bold">{formatter.format(totalEarnings)}</p>
        </div>
      </div>
    </section>
  );
}
