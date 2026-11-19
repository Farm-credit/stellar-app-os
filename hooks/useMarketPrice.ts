import { useQuery } from '@tanstack/react-query';
import { fetchMarketPrice } from '@/lib/stellar/listing';
import type { MarketPriceData } from '@/lib/types/listing';

export type HistoricalGranularity = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';

export interface HistoricalCarbonDataParams {
  startDate: string;
  endDate: string;
  granularity?: HistoricalGranularity;
  region?: string;
  projectType?: string;
}

export interface HistoricalPricePoint {
  timestamp: string;
  price: number;
  volume?: number;
}

export interface HistoricalProjectPerformancePoint {
  timestamp: string;
  projectsActive: number;
  creditsIssued: number;
  creditsRetired: number;
  averagePrice: number;
}

export interface HistoricalBuyerTrendPoint {
  timestamp: string;
  buyers: number;
  newBuyers: number;
  volume: number;
}

export interface HistoricalCarbonData {
  priceSeries: HistoricalPricePoint[];
  projectPerformance: HistoricalProjectPerformancePoint[];
  buyerTrends: HistoricalBuyerTrendPoint[];
  region?: string;
  projectType?: string;
  granularity: HistoricalGranularity;
  startDate: string;
  endDate: string;
}

const HISTORICAL_CARBON_DATA_ENDPOINT = '/api/carbon/historical';

export async function fetchHistoricalCarbonData(
  params: HistoricalCarbonDataParams,
): Promise<HistoricalCarbonData> {
  const searchParams = new URLSearchParams();
  searchParams.set('startDate', params.startDate);
  searchParams.set('endDate', params.endDate);
  if (params.granularity) searchParams.set('granularity', params.granularity);
  if (params.region) searchParams.set('region', params.region);
  if (params.projectType) searchParams.set('projectType', params.projectType);

  const response = await fetch(
    `${HISTORICAL_CARBON_DATA_ENDPOINT}?${searchParams.toString()}`,
  );

  if (!response.ok) {
    throw new Error(
      `Failed to fetch historical carbon data: ${response.status} ${response.statusText}`,
    );
  }

  return (await response.json()) as HistoricalCarbonData;
}

export function useHistoricalCarbonData(
  params: HistoricalCarbonDataParams | undefined,
) {
  return useQuery({
    queryKey: [
      'historical-carbon-data',
      params?.startDate,
      params?.endDate,
      params?.granularity ?? 'monthly',
      params?.region ?? null,
      params?.projectType ?? null,
    ],
    queryFn: (): Promise<HistoricalCarbonData> => {
      if (!params) {
        return Promise.reject(new Error('Historical carbon data params are required'));
      }
      return fetchHistoricalCarbonData(params);
    },
    enabled: !!params?.startDate && !!params?.endDate,
    staleTime: 300000,
    retry: 2,
  });
}

export interface UseMarketPriceOptions {
  includeHistory?: boolean;
  historyParams?: Omit<HistoricalCarbonDataParams, 'projectType'>;
}

export interface MarketPriceWithHistory extends MarketPriceData {
  priceSeries?: HistoricalPricePoint[];
}

export function useMarketPrice(
  creditType: string | undefined,
  options: UseMarketPriceOptions = {},
) {
  const { includeHistory = false, historyParams } = options;

  return useQuery({
    queryKey: [
      'market-price',
      creditType,
      includeHistory,
      includeHistory ? historyParams?.startDate : null,
      includeHistory ? historyParams?.endDate : null,
      includeHistory ? historyParams?.granularity ?? 'monthly' : null,
      includeHistory ? historyParams?.region ?? null : null,
    ],
    queryFn: async (): Promise<MarketPriceWithHistory | undefined> => {
      if (!creditType) return undefined;

      const current = await fetchMarketPrice(creditType);
      if (!current) return undefined;

      if (!includeHistory || !historyParams?.startDate || !historyParams?.endDate) {
        return current;
      }

      try {
        const historical = await fetchHistoricalCarbonData({
          ...historyParams,
          projectType: creditType,
        });
        return { ...current, priceSeries: historical.priceSeries };
      } catch {
        return current;
      }
    },
    enabled: !!creditType,
    staleTime: 60000,
    retry: 2,
  });
}