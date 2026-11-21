'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchFarmerSuccessStories } from '@/lib/api/mock/farmerSuccessStories';
import type { FarmerSuccessStory } from '@/lib/types/farmer-success-story';

/**
 * Loads the public farmer success stories / case studies (issue #1427).
 *
 * The data currently comes from the typed local fixture in
 * `lib/api/mock/farmerSuccessStories.ts` because no case-study endpoint exists
 * yet. Swapping `queryFn` for a real endpoint will not change the hook shape.
 */
export function useFarmerSuccessStories() {
  const { data, isLoading, isError, error, refetch } = useQuery<FarmerSuccessStory[]>({
    queryKey: ['farmerSuccessStories'],
    queryFn: fetchFarmerSuccessStories,
    staleTime: 5 * 60 * 1000,
    refetchIntervalInBackground: false,
  });

  return {
    stories: data ?? [],
    isLoading,
    isError,
    error: error instanceof Error ? error.message : 'Failed to load farmer success stories',
    retry: refetch,
  };
}
