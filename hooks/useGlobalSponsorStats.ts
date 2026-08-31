'use client';

import { useQuery } from '@tanstack/react-query';
import type { GlobalSponsorStats } from '@/lib/api/carbon-impact';

async function fetchGlobalSponsorStats(): Promise<GlobalSponsorStats> {
  const res = await fetch('/api/impact/global-stats');
  if (!res.ok) throw new Error('Failed to fetch global sponsor stats');
  return res.json();
}

export function useGlobalSponsorStats() {
  const { data, isLoading, isError, error, refetch } = useQuery<GlobalSponsorStats>({
    queryKey: ['globalSponsorStats'],
    queryFn: fetchGlobalSponsorStats,
    refetchInterval: 60000,
    refetchIntervalInBackground: false,
    staleTime: 55000,
  });

  return {
    stats: data,
    isLoading,
    isError,
    error: error instanceof Error ? error.message : 'Failed to fetch global stats',
    retry: refetch,
    lastUpdated: data?.cachedAt ? new Date(data.cachedAt) : null,
  };
}
