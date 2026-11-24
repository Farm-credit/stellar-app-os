'use client';

import React, { useState } from 'react';
import 'next/link';
import 'lucide-react';
import { useReferralStats } from '@/hooks/useReferralStats';
import ReferralLinkCard from '@/components/ReferralLinkCard';
import StatsDisplay from '@/components/StatsDisplay';
import RewardTiers from '@/components/RewardTiers';
import SocialShareButtons from '@/components/SocialShareButtons';
import type { ReferralType } from '@/lib/referrals';

export default function ReferralProgramPage() {
  const [activeRole, setActiveRole] = useState<ReferralType>('planter');
  const { stats, loading, error } = useReferralStats(activeRole);

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
          Connect your Stellar wallet to generate your referral link and track rewards. Planters earn
          2 XLM per referred planter who completes their first job.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="mb-2 text-3xl font-bold">Referral Program</h1>
          <p className="text-gray-500">
            {activeRole === 'planter'
              ? 'Planters can earn 2 XLM per referred planter who completes their first job, up to ten rewards each calendar month.'
              : 'Refer sponsors who complete their first tree and earn 1 XLM per eligible referral, up to ten rewards each calendar month.'}
          </p>
        </div>
      </div>

      <div className="mb-6 flex rounded-lg border border-border bg-muted/20 p-1">
        <button
          type="button"
          onClick={() => setActiveRole('planter')}
          className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
            activeRole === 'planter'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
          aria-pressed={activeRole === 'planter'}
        >
          Planter Referrals (2 XLM)
        </button>
        <button
          type="button"
          onClick={() => setActiveRole('sponsor')}
          className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
            activeRole === 'sponsor'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
          aria-pressed={activeRole === 'sponsor'}
        >
          Sponsor Referrals (1 XLM)
        </button>
      </div>

      <ReferralLinkCard
        referralLink={stats.referralLink}
        {...(activeRole === 'planter'
          ? {
              rewardAmountXlm: stats.rewardAmountXlm,
              planterReferralsCount: stats.planterReferralsCount,
              rewardedPlanterReferralsCount: stats.rewardedPlanterReferralsCount,
              pendingPlanterReferralsCount: stats.pendingPlanterReferralsCount,
              totalEarnings: stats.totalEarnings,
            }
          : {})}
      />

      {activeRole === 'planter' && (
        <section
          aria-label="Planter referral earnings summary"
          className="mb-6 rounded-lg border border-border bg-muted/30 p-6"
        >
          <h2 className="mb-2 text-lg font-semibold">Your planter referral earnings</h2>
          <p className="mb-3 text-sm text-muted-foreground">
            Earn 2 XLM for every referred planter who completes their first job. Rewards are capped
            at 10 per calendar month.
          </p>
          <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-muted-foreground">Reward per referral</dt>
              <dd className="font-semibold">{stats.rewardAmountXlm} XLM</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Referred planters</dt>
              <dd className="font-semibold">{stats.planterReferralsCount}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Rewarded</dt>
              <dd className="font-semibold">{stats.rewardedPlanterReferralsCount}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Pending first job</dt>
              <dd className="font-semibold">{stats.pendingPlanterReferralsCount}</dd>
            </div>
          </dl>
          <p className="mt-3 text-sm">
            Total earnings: <span className="font-semibold">{stats.totalEarnings} XLM</span>
          </p>
        </section>
      )}

      <StatsDisplay
        referralsCount={stats.referralsCount}
        totalEarnings={stats.totalEarnings}
        rewardsThisMonth={stats.rewardsThisMonth}
        monthlyCap={stats.monthlyCap}
      />

      <RewardTiers tiers={stats.tiers} />

      <SocialShareButtons
        url={stats.referralLink}
        title={
          activeRole === 'planter'
            ? 'Join our planting team on Stellar Farm Credit and earn XLM!'
            : 'Join me on Stellar Farm Credit'
        }
      />
    </main>
  );
}
