export type AnalyticsTimeRange = '7d' | '30d' | 'all';

export interface AdminAnalyticsMetrics {
  totalFarmers: number;
  activeEscrows: number;
  totalDonationsXlm: number;
  treesFunded: number;
  payoutsProcessed: number;
}

export interface AdminAnalyticsData {
  range: AnalyticsTimeRange;
  generatedAt: string;
  metrics: AdminAnalyticsMetrics;
}
