import type {
  AdminAnalyticsData,
  AdminAnalyticsMetrics,
  AnalyticsTimeRange,
} from '@/lib/types/adminAnalytics';

const ALL_TIME_METRICS: AdminAnalyticsMetrics = {
  totalFarmers: 1284,
  activeEscrows: 312,
  totalDonationsXlm: 845_320,
  treesFunded: 96_410,
  payoutsProcessed: 4_837,
};

const RANGE_RATIO: Record<AnalyticsTimeRange, number> = {
  '7d': 0.06,
  '30d': 0.22,
  all: 1,
};

function scaleMetrics(ratio: number): AdminAnalyticsMetrics {
  return {
    totalFarmers: Math.round(ALL_TIME_METRICS.totalFarmers * ratio),
    activeEscrows: Math.round(ALL_TIME_METRICS.activeEscrows * ratio),
    totalDonationsXlm: Math.round(ALL_TIME_METRICS.totalDonationsXlm * ratio),
    treesFunded: Math.round(ALL_TIME_METRICS.treesFunded * ratio),
    payoutsProcessed: Math.round(ALL_TIME_METRICS.payoutsProcessed * ratio),
  };
}

export async function getAdminAnalyticsData(
  range: AnalyticsTimeRange = '30d',
): Promise<AdminAnalyticsData> {
  await new Promise((resolve) => setTimeout(resolve, 400));
  return {
    range,
    generatedAt: new Date().toISOString(),
    metrics: scaleMetrics(RANGE_RATIO[range]),
  };
}
