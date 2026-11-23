'use client';

import React, { useState } from 'react';

interface ReferralLinkCardProps {
  referralLink: string;
  rewardAmountXlm?: number;
  planterReferralsCount?: number;
  rewardedPlanterReferralsCount?: number;
  pendingPlanterReferralsCount?: number;
  totalEarnings?: number;
}

export default function ReferralLinkCard({
  referralLink,
  rewardAmountXlm,
  planterReferralsCount,
  rewardedPlanterReferralsCount,
  pendingPlanterReferralsCount,
  totalEarnings,
}: ReferralLinkCardProps) {
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(referralLink);
      setStatus('success');
      setTimeout(() => setStatus('idle'), 2000);
    } catch {
      setStatus('error');
      setTimeout(() => setStatus('idle'), 2000);
    }
  };

  const hasPlanterSummary =
    rewardAmountXlm !== undefined ||
    planterReferralsCount !== undefined ||
    rewardedPlanterReferralsCount !== undefined ||
    pendingPlanterReferralsCount !== undefined ||
    totalEarnings !== undefined;

  return (
    <div className="rounded-lg border border-gray-200 p-4 mb-6">
      <label htmlFor="ref-link" className="block text-sm font-medium mb-2">
        Your referral link
      </label>
      <div className="flex items-center gap-2">
        <input
          id="ref-link"
          type="text"
          readOnly
          value={referralLink}
          className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm bg-gray-50"
        />
        <button
          onClick={handleCopy}
          aria-live="polite"
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {status === 'success' ? '✓ Copied!' : status === 'error' ? 'Failed' : 'Copy'}
        </button>
      </div>
      {hasPlanterSummary && (
        <p className="mt-2 text-sm text-gray-600">
          Earn {rewardAmountXlm ?? 2} XLM per referred planter who completes their first job —{' '}
          {planterReferralsCount ?? 0} referred, {rewardedPlanterReferralsCount ?? 0} rewarded,{' '}
          {pendingPlanterReferralsCount ?? 0} pending, {totalEarnings ?? 0} XLM earned
        </p>
      )}
    </div>
  );
}