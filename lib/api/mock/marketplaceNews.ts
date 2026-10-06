import type { MarketplaceMarketSnapshot, MarketplaceNewsItem } from '@/lib/types/marketplace-news';

/**
 * Deterministic seed data for the first marketplace news release. The shape is
 * intentionally API-compatible so this source can be replaced by a live feed.
 */
export const MARKETPLACE_NEWS: MarketplaceNewsItem[] = [
  {
    id: 'price-west-africa-1',
    category: 'price-movements',
    headline: 'West African restoration credits move higher on tight supply',
    summary:
      'Verified restoration credits are trading above last month’s average as buyers replenish 2025 delivery books.',
    source: 'Stellar Market Desk',
    publishedAt: '2026-09-25T09:00:00Z',
    region: 'West Africa',
    metric: '+8.4%',
    metricLabel: '30-day price',
    tone: 'positive',
  },
  {
    id: 'policy-eu-1',
    category: 'policy',
    headline: 'New buyer guidance raises demand for traceable project data',
    summary:
      'Updated disclosure guidance is pushing buyers toward credits with clear vintage, location, and verification records.',
    source: 'Carbon Policy Monitor',
    publishedAt: '2026-09-24T13:30:00Z',
    region: 'European Union',
    metric: '2027',
    metricLabel: 'guidance cycle',
    tone: 'neutral',
  },
  {
    id: 'project-brazil-1',
    category: 'new-projects',
    headline: 'Amazon basin agroforestry project opens its first credit tranche',
    summary:
      'A 4,800-tonne verified tranche combines native tree restoration with smallholder income protection.',
    source: 'Project Registry Watch',
    publishedAt: '2026-09-23T08:15:00Z',
    region: 'Brazil',
    metric: '4,800 t',
    metricLabel: 'available credits',
    tone: 'positive',
  },
  {
    id: 'demand-north-america-1',
    category: 'buyer-demand',
    headline: 'Corporate buyers prioritise durable removal for 2026 procurement',
    summary:
      'Buyer requests for long-duration removals have increased while demand for unverified spot inventory softens.',
    source: 'Buyer Demand Index',
    publishedAt: '2026-09-22T16:00:00Z',
    region: 'North America',
    metric: '+14%',
    metricLabel: 'buyer enquiries',
    tone: 'positive',
  },
  {
    id: 'regional-asia-1',
    category: 'regional-insights',
    headline: 'Southeast Asia sees more interest in mangrove restoration credits',
    summary:
      'Regional buyers are combining coastal resilience goals with credit purchases, creating a stronger premium for verified impact.',
    source: 'Regional Insights',
    publishedAt: '2026-09-21T11:45:00Z',
    region: 'Southeast Asia',
    metric: '3.2x',
    metricLabel: 'watchlist growth',
    tone: 'positive',
  },
];

export const MARKETPLACE_SNAPSHOTS: MarketplaceMarketSnapshot[] = [
  {
    label: 'Average spot price',
    value: '$14.80',
    change: '+6.2%',
    context: 'across verified listings',
    tone: 'positive',
  },
  {
    label: 'Buyer demand',
    value: 'Strong',
    change: '+11.8%',
    context: 'week over week',
    tone: 'positive',
  },
  {
    label: 'Active regions',
    value: '18',
    change: '5 new',
    context: 'with fresh market activity',
    tone: 'neutral',
  },
];
