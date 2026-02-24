export type AnalyticsChartType = 'line' | 'bar' | 'pie' | 'donut';
export type AnalyticsDatePreset = '7d' | '30d' | '90d';
export type AnalyticsExportFormat = 'png' | 'svg';

export interface AnalyticsDateRange {
  preset: AnalyticsDatePreset | 'custom';
  from: string;
  to: string;
}

export interface AnalyticsDataPoint {
  date: string;
  users: number;
  transactions: number;
  revenue: number;
}

export interface AnalyticsPieSlice {
  name: string;
  value: number;
  fill: string; // hex, resolved at data-generation time
}

export interface AnalyticsDataset {
  timeSeries: AnalyticsDataPoint[];
  donationCategories: AnalyticsPieSlice[];
  projectStatus: AnalyticsPieSlice[];
  lastUpdatedAt: number; // Date.now()
}

export interface UseAnalyticsDataReturn {
  dataset: AnalyticsDataset | null;
  isLoading: boolean;
  error: string | null;
  isLive: boolean;
  dateRange: AnalyticsDateRange;
  // eslint-disable-next-line no-unused-vars
  setDateRange: (range: AnalyticsDateRange) => void;
  refresh: () => void;
}
