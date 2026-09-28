import {
  aggregateSeries,
  buildDailySeries,
  CARBON_PRICE_CATALOG,
  CARBON_PROJECT_TYPES,
  CARBON_REGIONS,
  type CarbonPricePoint,
  type CarbonProjectType,
  type CarbonRegion,
  type PriceInterval,
} from '@/lib/api/carbon-prices';

export const HISTORICAL_INTERVALS = ['day', 'week', 'month'] as const;
export const DEFAULT_HISTORICAL_DAYS = 365;
export const MAX_HISTORICAL_DAYS = 730;

type HistoricalInterval = (typeof HISTORICAL_INTERVALS)[number];

export interface HistoricalCarbonRequest {
  from?: string;
  to?: string;
  interval: HistoricalInterval;
  regions?: CarbonRegion[];
  projectTypes?: CarbonProjectType[];
}
export type HistoricalCarbonParseResult =
  { ok: true; data: HistoricalCarbonRequest } | { ok: false; errors: string[] };

export interface HistoricalMarketPoint {
  period: string;
  averagePricePerTon: number;
  volumeTonnes: number;
  seriesCount: number;
}

export interface ProjectPerformance {
  projectId: string;
  projectName: string;
  projectType: CarbonProjectType;
  region: CarbonRegion;
  periods: number;
  firstPricePerTon: number;
  lastPricePerTon: number;
  averagePricePerTon: number;
  priceChangePercent: number;
  volumeTonnes: number;
}

export interface BuyerTrend {
  dimension: 'region' | 'projectType';
  key: string;
  periods: HistoricalMarketPoint[];
  volumeChangePercent: number;
}

export interface HistoricalCarbonData {
  generatedAt: string;
  source: 'catalog';
  from: string;
  to: string;
  interval: HistoricalInterval;
  filters: {
    regions: CarbonRegion[] | null;
    projectTypes: CarbonProjectType[] | null;
  };
  priceHistory: HistoricalMarketPoint[];
  projectPerformance: ProjectPerformance[];
  buyerTrends: BuyerTrend[];
  dataQuality: {
    buyerActivityMetric: 'listed_volume_tonnes';
    note: string;
  };
}

function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

function splitList(value: string | null): string[] | undefined {
  if (!value) return undefined;
  const values = value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  return values.length ? values : undefined;
}

function canonical<T extends string>(value: string, allowed: readonly T[]): T | undefined {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]/g, '');
  return allowed.find((item) => item.toLowerCase().replace(/[^a-z0-9]/g, '') === normalized);
}

function parseList<T extends string>(
  value: string | null,
  field: string,
  allowed: readonly T[],
  errors: string[]
): T[] | undefined {
  const raw = splitList(value);
  if (!raw) return undefined;
  const result: T[] = [];
  for (const item of raw) {
    const match = canonical(item, allowed);
    if (!match) errors.push(`Unknown ${field} value: "${item}"`);
    else if (!result.includes(match)) result.push(match);
  }
  return result.length ? result : undefined;
}

function readDate(value: string | null, field: string, errors: string[]): string | undefined {
  if (!value) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    errors.push(`${field} must be a valid ISO date (YYYY-MM-DD)`);
    return undefined;
  }
  return value;
}

export function parseHistoricalCarbonQuery(params: URLSearchParams): HistoricalCarbonParseResult {
  const errors: string[] = [];
  const from = readDate(params.get('from'), 'from', errors);
  const to = readDate(params.get('to'), 'to', errors);
  const interval = (params.get('interval') ?? 'month').toLowerCase();
  if (!HISTORICAL_INTERVALS.includes(interval as HistoricalInterval)) {
    errors.push(`interval must be one of: ${HISTORICAL_INTERVALS.join(', ')}`);
  }
  const regions = parseList(
    params.get('regions') ?? params.get('region'),
    'regions',
    CARBON_REGIONS,
    errors
  );
  const projectTypes = parseList(
    params.get('projectTypes') ?? params.get('projectType'),
    'projectTypes',
    CARBON_PROJECT_TYPES,
    errors
  );

  if (from && to && from > to) errors.push('from must not be after to');
  if (from && to) {
    const span =
      Math.floor((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) +
      1;
    if (span > MAX_HISTORICAL_DAYS)
      errors.push(`date range must not exceed ${MAX_HISTORICAL_DAYS} days`);
  }

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    data: {
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      interval: interval as HistoricalInterval,
      ...(regions ? { regions } : {}),
      ...(projectTypes ? { projectTypes } : {}),
    },
  };
}

function weightedPoint(points: CarbonPricePoint[], records: number): HistoricalMarketPoint {
  const volume = points.reduce((sum, point) => sum + point.volume, 0);
  const price = volume
    ? points.reduce((sum, point) => sum + point.pricePerTon * point.volume, 0) / volume
    : points.reduce((sum, point) => sum + point.pricePerTon, 0) / Math.max(points.length, 1);
  return {
    period: points[0]?.at ?? '',
    averagePricePerTon: round(price),
    volumeTonnes: Math.round(volume),
    seriesCount: records,
  };
}

function combineSeries(
  series: CarbonPricePoint[][],
  interval: PriceInterval
): HistoricalMarketPoint[] {
  const byPeriod = new Map<string, CarbonPricePoint[]>();
  for (const points of series) {
    for (const point of aggregateSeries(points, interval)) {
      const bucket = byPeriod.get(point.at) ?? [];
      bucket.push(point);
      byPeriod.set(point.at, bucket);
    }
  }
  return [...byPeriod.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, points]) => ({ ...weightedPoint(points, points.length), period }));
}

function performanceFor(
  record: (typeof CARBON_PRICE_CATALOG)[number],
  points: CarbonPricePoint[],
  interval: PriceInterval
): ProjectPerformance {
  const buckets = aggregateSeries(points, interval);
  const prices = buckets.map((point) => point.pricePerTon);
  const first = prices[0] ?? 0;
  const last = prices[prices.length - 1] ?? 0;
  return {
    projectId: record.projectId,
    projectName: record.projectName,
    projectType: record.projectType,
    region: record.region,
    periods: buckets.length,
    firstPricePerTon: round(first),
    lastPricePerTon: round(last),
    averagePricePerTon: round(
      prices.reduce((sum, price) => sum + price, 0) / Math.max(prices.length, 1)
    ),
    priceChangePercent: first ? round(((last - first) / first) * 100) : 0,
    volumeTonnes: Math.round(buckets.reduce((sum, point) => sum + point.volume, 0)),
  };
}

function trendsFor(
  records: { record: (typeof CARBON_PRICE_CATALOG)[number]; points: CarbonPricePoint[] }[],
  interval: PriceInterval,
  dimension: 'region' | 'projectType'
): BuyerTrend[] {
  const groups = new Map<
    string,
    { record: (typeof CARBON_PRICE_CATALOG)[number]; points: CarbonPricePoint[] }[]
  >();
  for (const item of records) {
    const key = dimension === 'region' ? item.record.region : item.record.projectType;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, items]) => {
      const periods = combineSeries(
        items.map((item) => item.points),
        interval
      );
      const previous = periods.at(-2)?.volumeTonnes ?? 0;
      const current = periods.at(-1)?.volumeTonnes ?? 0;
      return {
        dimension,
        key,
        periods,
        volumeChangePercent: previous ? round(((current - previous) / previous) * 100) : 0,
      };
    });
}

export function getHistoricalCarbonData(
  request: HistoricalCarbonRequest,
  now = new Date()
): HistoricalCarbonData {
  const end = request.to
    ? new Date(`${request.to}T00:00:00Z`)
    : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const start = request.from
    ? new Date(`${request.from}T00:00:00Z`)
    : addDays(end, -(DEFAULT_HISTORICAL_DAYS - 1));
  const days = Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;
  const records = CARBON_PRICE_CATALOG.filter(
    (record) =>
      (!request.regions?.length || request.regions.includes(record.region)) &&
      (!request.projectTypes?.length || request.projectTypes.includes(record.projectType))
  ).map((record) => ({
    record,
    points: buildDailySeries(record, Math.min(days, MAX_HISTORICAL_DAYS), end).filter(
      (point) => point.at >= dateKey(start) && point.at <= dateKey(end)
    ),
  }));

  return {
    generatedAt: now.toISOString(),
    source: 'catalog',
    from: dateKey(start),
    to: dateKey(end),
    interval: request.interval,
    filters: {
      regions: request.regions ?? null,
      projectTypes: request.projectTypes ?? null,
    },
    priceHistory: combineSeries(
      records.map((item) => item.points),
      request.interval
    ),
    projectPerformance: records.map((item) =>
      performanceFor(item.record, item.points, request.interval)
    ),
    buyerTrends: [
      ...trendsFor(records, request.interval, 'region'),
      ...trendsFor(records, request.interval, 'projectType'),
    ],
    dataQuality: {
      buyerActivityMetric: 'listed_volume_tonnes',
      note: 'Buyer trends use aggregated listed series volume; buyer identities are not exposed by this public endpoint.',
    },
  };
}
