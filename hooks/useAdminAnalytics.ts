'use client';

import { useCallback, useEffect, useState } from 'react';
import { getAdminAnalyticsData } from '@/lib/api/mock/adminAnalytics';
import type { AdminAnalyticsData, AnalyticsTimeRange } from '@/lib/types/adminAnalytics';

export function useAdminAnalytics(range: AnalyticsTimeRange) {
  const [data, setData] = useState<AdminAnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await getAdminAnalyticsData(range);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load analytics');
    } finally {
      setIsLoading(false);
    }
  }, [range]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, isLoading, error, refetch: fetchData };
}
