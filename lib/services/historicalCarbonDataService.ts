export type HistoricalGranularity = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';

export interface HistoricalCarbonDataQuery {
  startDate: string;
  endDate: string;
  granularity: HistoricalGranularity;
  region?: string;
  projectType?: string;
}

export interface HistoricalCarbonDataResponse {
  query: HistoricalCarbonDataQuery;
  priceSeries: {
    overall: unknown[];
    byProjectType: Record<string, unknown>;
  };
  projectPerformance: unknown[];
  buyerTrends: unknown[];
  generatedAt: string;
}

export const historicalCarbonDataService = {
  getHistoricalData(query: HistoricalCarbonDataQuery): Promise<HistoricalCarbonDataResponse> {
    return Promise.resolve({
      query,
      priceSeries: { overall: [], byProjectType: {} },
      projectPerformance: [],
      buyerTrends: [],
      generatedAt: new Date().toISOString(),
    });
  },
};
