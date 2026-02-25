'use client';

import { useEffect, useState } from 'react';
import type { ReferralStats } from '../lib/referrals';
import { getMockReferralStats } from '../lib/referrals';

interface UseReferralStatsReturn {
  stats: ReferralStats | null;
  loading: boolean;
  error: string | null;
}

export function useReferralStats(): UseReferralStatsReturn {
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      // Swap to getReferralStats() when real API is ready
      const data = getMockReferralStats();
      setStats(data);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Something went wrong');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  return { stats, loading, error };
}
