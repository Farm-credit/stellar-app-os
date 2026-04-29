import { useQuery } from '@tanstack/react-query';
import { fetchUserCredits } from '@/lib/stellar/listing';
import type { Credit } from '@/lib/types/listing';

export function useUserCredits(publicKey: string | null) {
  return useQuery({
    queryKey: ['user-credits', publicKey],
    queryFn: (): Promise<Credit[]> => {
      if (!publicKey) return Promise.resolve([]);
      return fetchUserCredits(publicKey);
    },
    enabled: !!publicKey,
    staleTime: 30000,
    retry: 2,
  });
}
