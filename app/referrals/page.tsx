'use client';

import React from 'react';
import { useReferralStats } from '@/hooks/useReferralStats';
import ReferralLinkCard from '@/components/ReferralLinkCard';
import StatsDisplay from '@/components/StatsDisplay';
import RewardTiers from '@/components/RewardTiers';
import SocialShareButtons from '@/components/SocialShareButtons';

export default function ReferralProgramPage() {
  const { stats, loading, error } = useReferralStats();

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p>Loading referral program…</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <p role="alert" className="text-red-600">
          Error: {error}
        </p>
      </main>
    );
  }

  if (!stats) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16">
        <h1 className="mb-2 text-3xl font-bold">Referral Program</h1>
        <p className="rounded-lg border border-border bg-muted/30 p-6 text-muted-foreground">
          Connect your Stellar wallet to generate your referral link and track 1 XLM rewards.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-2 text-3xl font-bold">Referral Program</h1>
      <p className="mb-6 text-gray-500">
        Refer sponsors who complete their first tree and earn 1 XLM per eligible referral, up to ten
        rewards each calendar month.
      </p>

      <ReferralLinkCard referralLink={stats.referralLink} />

      <StatsDisplay
        referralsCount={stats.referralsCount}
        totalEarnings={stats.totalEarnings}
        rewardsThisMonth={stats.rewardsThisMonth}
        monthlyCap={stats.monthlyCap}
      />

      <RewardTiers tiers={stats.tiers} />

      <SocialShareButtons url={stats.referralLink} title="Join me on Stellar Farm Credit" />
    </main>
  );
}
