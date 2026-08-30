'use client';

import React from 'react';

interface StatsDisplayProps {
  referralsCount: number;
  totalEarnings: number;
  rewardsThisMonth: number;
  monthlyCap: number;
}

export default function StatsDisplay({
  referralsCount,
  totalEarnings,
  rewardsThisMonth,
  monthlyCap,
}: StatsDisplayProps) {
  const formattedEarnings = `${totalEarnings.toFixed(3).replace(/\.000$/, '')} XLM`;
  const remaining = Math.max(monthlyCap - rewardsThisMonth, 0);

  return (
    <section aria-labelledby="stats-heading" className="mb-6">
      <h2 id="stats-heading" className="mb-3 text-xl font-semibold">
        Your Stats
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-border p-4 text-center">
          <p className="text-sm text-muted-foreground">Eligible referrals</p>
          <p className="text-3xl font-bold">{referralsCount}</p>
        </div>
        <div className="rounded-lg border border-border p-4 text-center">
          <p className="text-sm text-muted-foreground">Queued or paid</p>
          <p className="text-3xl font-bold">{formattedEarnings}</p>
        </div>
        <div className="rounded-lg border border-border p-4 text-center">
          <p className="text-sm text-muted-foreground">Remaining this month</p>
          <p className="text-3xl font-bold">{remaining}</p>
          <p className="text-xs text-muted-foreground">of {monthlyCap} rewards</p>
        </div>
      </div>
    </section>
  );
}
