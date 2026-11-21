export type MarketplaceNewsCategory =
  'price-movements' | 'policy' | 'new-projects' | 'buyer-demand' | 'regional-insights';

export interface MarketplaceNewsItem {
  id: string;
  category: MarketplaceNewsCategory;
  headline: string;
  summary: string;
  source: string;
  publishedAt: string;
  region: string;
  metric?: string;
  metricLabel?: string;
  tone: 'positive' | 'neutral' | 'caution';
}

export interface MarketplaceMarketSnapshot {
  label: string;
  value: string;
  change: string;
  context: string;
  tone: 'positive' | 'neutral' | 'caution';
}
