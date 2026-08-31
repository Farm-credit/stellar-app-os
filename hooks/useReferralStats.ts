'use client';

import { useEffect, useState } from 'react';
import type { ReferralStats } from '../lib/referrals';
import { useWalletContext } from '@/contexts/WalletContext';

interface UseReferralStatsReturn {
  stats: ReferralStats | null;
  loading: boolean;
  error: string | null;
}

export function useReferralStats(): UseReferralStatsReturn {
  const { wallet } = useWalletContext();
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      if (!wallet?.publicKey) {
        setStats(null);
        setLoading(false);
        return;
      }

      try {
        const referralCode = new URLSearchParams(window.location.search).get('ref');
        if (referralCode) {
          await fetch('/api/referrals', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ code: referralCode, referredWallet: wallet.publicKey }),
          });
        }

        const response = await fetch(
          `/api/referrals?wallet=${encodeURIComponent(wallet.publicKey)}`
        );
        if (!response.ok) throw new Error('Failed to load referral data');
        const data = (await response.json()) as ReferralStats;
        if (!cancelled) setStats(data);
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
  }, [wallet?.publicKey]);

  return { stats, loading, error };
}
