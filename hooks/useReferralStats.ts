'use client';

import { useEffect, useState } from 'react';
import type { ReferralStats, ReferralType } from '../lib/referrals';
import { useWalletContext } from '@/contexts/WalletContext';

export const PLANTER_REFERRAL_REWARD_XLM = 2;

interface PlanterReferralStats {
  planterReferralsCount: number;
  rewardedPlanterReferralsCount: number;
  pendingPlanterReferralsCount: number;
  totalEarnings: number;
  rewardAmountXlm: number;
}

interface UseReferralStatsReturn {
  stats: ReferralStats | null;
  planterStats: PlanterReferralStats | null;
  loading: boolean;
  error: string | null;
}

export function useReferralStats(role?: ReferralType): UseReferralStatsReturn {
  const { wallet } = useWalletContext();
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [planterStats, setPlanterStats] = useState<PlanterReferralStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      if (!wallet?.publicKey) {
        setStats(null);
        setPlanterStats(null);
        setLoading(false);
        return;
      }

      try {
        const referralCode = new URLSearchParams(window.location.search).get('ref');
        const roleParam =
          role ??
          (new URLSearchParams(window.location.search).get('role') as ReferralType | null) ??
          undefined;

        if (referralCode) {
          await fetch('/api/referrals', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              code: referralCode,
              referredWallet: wallet.publicKey,
              role: roleParam,
            }),
          });
        }

        const roleQuery = roleParam ? `&role=${encodeURIComponent(roleParam)}` : '';
        const response = await fetch(
          `/api/referrals?wallet=${encodeURIComponent(wallet.publicKey)}${roleQuery}`
        );
        if (!response.ok) throw new Error('Failed to load referral data');
        const data = (await response.json()) as ReferralStats & Partial<PlanterReferralStats>;
        if (!cancelled) {
          setStats(data);
          if (roleParam === 'planter') {
            const planterReferralsCount = data.planterReferralsCount ?? 0;
            const rewardedPlanterReferralsCount = data.rewardedPlanterReferralsCount ?? 0;
            const pendingPlanterReferralsCount =
              data.pendingPlanterReferralsCount ??
              Math.max(planterReferralsCount - rewardedPlanterReferralsCount, 0);
            const rewardAmountXlm = data.rewardAmountXlm ?? PLANTER_REFERRAL_REWARD_XLM;
            const totalEarnings =
              data.totalEarnings ?? rewardedPlanterReferralsCount * rewardAmountXlm;
            setPlanterStats({
              planterReferralsCount,
              rewardedPlanterReferralsCount,
              pendingPlanterReferralsCount,
              totalEarnings,
              rewardAmountXlm,
            });
          } else {
            setPlanterStats(null);
          }
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Something went wrong');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [wallet?.publicKey, role]);

  return { stats, planterStats, loading, error };
}
