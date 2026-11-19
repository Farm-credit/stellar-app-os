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

export interface HistoricalCarbonDataFilters {
  region?: string;
  projectType?: string;
  granularity?: HistoricalGranularity;
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

export function buildHistoricalCarbonDataQuery(
  params: HistoricalCarbonDataParams,
): string {
  const searchParams = new URLSearchParams();
  searchParams.set('startDate', params.startDate);
  searchParams.set('endDate', params.endDate);
  searchParams.set('granularity', params.granularity ?? 'monthly');
  if (params.region) searchParams.set('region', params.region);
  if (params.projectType) searchParams.set('projectType', params.projectType);
  return searchParams.toString();
}

export async function fetchHistoricalCarbonData(
  params: HistoricalCarbonDataParams,
): Promise<HistoricalCarbonData> {
  const response = await fetch(
    `${HISTORICAL_CARBON_DATA_ENDPOINT}?${buildHistoricalCarbonDataQuery(params)}`,
  );

  if (!response.ok) {
    throw new Error(
      `Failed to fetch historical carbon data: ${response.status} ${response.statusText}`,
    );
  }

  return (await response.json()) as HistoricalCarbonData;
}

export function historicalCarbonDataQueryKey(
  params: HistoricalCarbonDataParams | undefined,
) {
  return [
    'historical-carbon-data',
    params?.startDate ?? null,
    params?.endDate ?? null,
    params?.granularity ?? 'monthly',
    params?.region ?? null,
    params?.projectType ?? null,
  ] as const;
}

export function useHistoricalCarbonData(
  params: HistoricalCarbonDataParams | undefined,
) {
  return useQuery({
    queryKey: historicalCarbonDataQueryKey(params),
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
  /** Overrides the project type used for the historical lookup (defaults to creditType). */
  projectType?: string;
}

export interface MarketPriceWithHistory extends MarketPriceData {
  priceSeries?: HistoricalPricePoint[];
  projectPerformance?: HistoricalProjectPerformancePoint[];
  buyerTrends?: HistoricalBuyerTrendPoint[];
}

export function useMarketPrice(
  creditType: string | undefined,
  options: UseMarketPriceOptions = {},
) {
  const { includeHistory = false, historyParams, projectType } = options;

  const effectiveProjectType = projectType ?? creditType;
  const hasHistoryRange =
    includeHistory && !!historyParams?.startDate && !!historyParams?.endDate;

  const historicalParams: HistoricalCarbonDataParams | undefined = hasHistoryRange
    ? {
        startDate: historyParams!.startDate,
        endDate: historyParams!.endDate,
        granularity: historyParams!.granularity ?? 'monthly',
        region: historyParams!.region,
        projectType: effectiveProjectType,
      }
    : undefined;

  return useQuery({
    queryKey: [
      'market-price',
      creditType,
      includeHistory,
      historicalParams ? historicalCarbonDataQueryKey(historicalParams) : null,
    ],
    queryFn: async (): Promise<MarketPriceWithHistory | undefined> => {
      if (!creditType) return undefined;

      const current = await fetchMarketPrice(creditType);
      if (!current) return undefined;

      if (!historicalParams) {
        return current;
      }

      try {
        const historical = await fetchHistoricalCarbonData(historicalParams);
        return {
          ...current,
          priceSeries: historical.priceSeries,
          projectPerformance: historical.projectPerformance,
          buyerTrends: historical.buyerTrends,
        };
      } catch {
        return current;
      }
    },
    enabled: !!creditType,
    staleTime: 60000,
    retry: 2,
  });
}