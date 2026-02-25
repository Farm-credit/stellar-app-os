import { useQuery } from '@tanstack/react-query';
import { fetchMarketPrice } from '@/lib/stellar/listing';
import type { MarketPriceData } from '@/lib/types/listing';

export function useMarketPrice(creditType: string | undefined) {
  return useQuery({
    queryKey: ['market-price', creditType],
    queryFn: (): Promise<MarketPriceData | undefined> => {
      if (!creditType) return Promise.resolve(undefined);
      return fetchMarketPrice(creditType);
    },
    enabled: !!creditType,
    staleTime: 60000, // 1 minute
    retry: 2,
  });
}
