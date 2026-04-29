'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchLiveImpactMetrics, type ImpactMetricsData } from '@/lib/stellar/queries';

export function useImpactMetrics() {
  const { data, isLoading, isError, error, refetch } = useQuery<ImpactMetricsData>({
    queryKey: ['impactMetrics'],
    queryFn: fetchLiveImpactMetrics,
    refetchInterval: 30000, // Poll every 30 seconds
    refetchIntervalInBackground: false, // Stop polling when tab is backgrounded
    staleTime: 25000, // Consider data stale after 25 seconds
  });

  return {
    metrics: data,
    isLoading,
    isError,
    error: error instanceof Error ? error.message : 'Failed to fetch impact metrics',
    retry: refetch,
    lastUpdated: data?.timestamp ? new Date(data.timestamp) : null,
  };
}
