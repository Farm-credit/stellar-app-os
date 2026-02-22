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
      <main className="flex items-center justify-center min-h-screen">
        <p>Loading…</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="flex items-center justify-center min-h-screen">
        <p role="alert" className="text-red-600">
          Error: {error}
        </p>
      </main>
    );
  }

  if (!stats) return null;

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-3xl font-bold mb-2">Referral Program</h1>
      <p className="text-gray-500 mb-6">
        Share your unique link with friends and earn rewards for every signup.
      </p>

      <ReferralLinkCard referralLink={stats.referralLink} />

      <StatsDisplay
        referralsCount={stats.referralsCount}
        totalEarnings={stats.totalEarnings}
      />

      <RewardTiers tiers={stats.tiers} />

      <SocialShareButtons referralLink={stats.referralLink} />
    </main>
  );
}