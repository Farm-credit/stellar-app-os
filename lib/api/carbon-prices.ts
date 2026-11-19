/**
 * Carbon price API — Issue #1388
 *
 * Public, read-only market data for carbon credits: real-time quotes filtered
 * by project type, region and certification standard, plus historical price
 * series for a single listed asset.
 *
 * The module is source-agnostic. `createCatalogPriceSource` adapts a curated
 * catalog of listed series into the `CarbonPriceSource` contract, which is what
 * the API routes consume; swapping in a live feed (a registry API, a DEX order
 * book, …) means implementing the same two methods and passing it through
 * `options.source`. Nothing above the source layer knows where prices come from.
 *
 * Historical points are derived deterministically from each series' base price
 * and the series' asset code, so the same request always returns the same
 * numbers and responses can be cached and diffed without churn. When a real
 * feed lands, only `createCatalogPriceSource` is replaced.
 *
 * Closes #1388
 */

export const CARBON_PRICE_CURRENCY = 'USD' as const;

export const CARBON_PROJECT_TYPES = [
  'Reforestation',
  'Renewable Energy',
  'Mangrove Restoration',
  'Sustainable Agriculture',
  'Other',
] as const;
export type CarbonProjectType = (typeof CARBON_PROJECT_TYPES)[number];

export const CARBON_CERTIFICATION_STANDARDS = [
  'Gold Standard',
  'Verra (VCS)',
  'Climate Action Reserve',
  'Plan Vivo',
] as const;
export type CarbonCertificationStandard = (typeof CARBON_CERTIFICATION_STANDARDS)[number];

export const CARBON_REGIONS = [
  'africa',
  'latin-america',
  'southeast-asia',
  'oceania',
  'north-america',
  'global',
] as const;
export type CarbonRegion = (typeof CARBON_REGIONS)[number];

export const PRICE_INTERVALS = ['day', 'week', 'month'] as const;
export type PriceInterval = (typeof PRICE_INTERVALS)[number];

/** Default window for a history request that supplies no bounds. */
export const DEFAULT_HISTORY_DAYS = 90;
const MAX_HISTORY_DAYS = 730;
const MAX_QUOTE_LIMIT = 500;

// ── Source contract ───────────────────────────────────────────────────────────

/** One listed credit series as the upstream feed describes it. */
export interface CarbonPriceSeriesRecord {
  /** Ledger asset code a buyer would trade (e.g. `CARBON-PROJ-004-2024`). */
  assetCode: string;
  projectId: string;
  projectName: string;
  projectType: CarbonProjectType;
  region: CarbonRegion;
  standard: CarbonCertificationStandard;
  /** Latest close in USD per tonne. */
  basePricePerTon: number;
  volume24h: number;
  /** ISO-8601 timestamp of the upstream's last repricing. */
  updatedAt: string;
}

/** A dated price observation. `at` is a `YYYY-MM-DD` bucket start (UTC). */
export interface CarbonPricePoint {
  at: string;
  pricePerTon: number;
  volume: number;
}

export interface CarbonPriceSource {
  readonly sourceId: string;
  listQuotes(): Promise<CarbonPriceSeriesRecord[]>;
  /** Daily closes for one asset, oldest first; `null` if the asset is unlisted. */
  getDailySeries(assetCode: string, days: number): Promise<CarbonPricePoint[] | null>;
}

// ── Response shapes ───────────────────────────────────────────────────────────

export interface CarbonPriceQuote {
  assetCode: string;
  projectId: string;
  projectName: string;
  projectType: CarbonProjectType;
  region: CarbonRegion;
  standard: CarbonCertificationStandard;
  currency: typeof CARBON_PRICE_CURRENCY;
  pricePerTon: number;
  previousClose: number;
  change24hAmount: number;
  change24hPercent: number;
  volume24h: number;
  updatedAt: string;
}

export interface CarbonPriceAggregateBucket {
  key: string;
  quoteCount: number;
  averagePricePerTon: number;
  totalVolume24h: number;
}

export interface CarbonPriceAggregates {
  averagePricePerTon: number;
  totalVolume24h: number;
  byType: CarbonPriceAggregateBucket[];
  byRegion: CarbonPriceAggregateBucket[];
  byStandard: CarbonPriceAggregateBucket[];
}

export interface CarbonPriceSnapshot {
  generatedAt: string;
  currency: typeof CARBON_PRICE_CURRENCY;
  source: string;
  filters: CarbonPriceFilters;
  count: number;
  quotes: CarbonPriceQuote[];
  aggregates: CarbonPriceAggregates;
}

export interface CarbonPriceHistoryStats {
  points: number;
  firstPrice: number;
  lastPrice: number;
  minPrice: number;
  maxPrice: number;
  averagePrice: number;
  changePercent: number;
  totalVolume: number;
}

export interface CarbonPriceHistory {
  assetCode: string;
  interval: PriceInterval;
  currency: typeof CARBON_PRICE_CURRENCY;
  from: string;
  to: string;
  points: CarbonPricePoint[];
  stats: CarbonPriceHistoryStats;
}

// ── Filters + validation ──────────────────────────────────────────────────────

export interface CarbonPriceFilters {
  types?: CarbonProjectType[];
  regions?: CarbonRegion[];
  standards?: CarbonCertificationStandard[];
  projectIds?: string[];
  assetCodes?: string[];
  limit?: number;
}

export interface Parsed<T> {
  ok: true;
  data: T;
}

export interface ParseFailed {
  ok: false;
  errors: string[];
}

export type ParseResult<T> = Parsed<T> | ParseFailed;

export interface HistoryRequest {
  assetCode: string;
  interval: PriceInterval;
  from?: string;
  to?: string;
}

/** Raised when the upstream price source cannot be read at all. */
export class CarbonPriceError extends Error {
  readonly failures: { sourceId: string; message: string }[];

  constructor(message: string, failures: { sourceId: string; message: string }[]) {
    super(message);
    this.name = 'CarbonPriceError';
    this.failures = failures;
  }
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Lowercase + strip everything that is not alphanumeric, for tolerant matching. */
function normalizeToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function matchCanonical<T extends string>(value: string, allowed: readonly T[]): T | undefined {
  const wanted = normalizeToken(value);
  return allowed.find((entry) => normalizeToken(entry) === wanted);
}

function readList(
  raw: string | null | undefined,
  field: string,
  allowed: readonly string[],
  errors: string[]
): string[] | undefined {
  if (raw === null || raw === undefined || raw === '') return undefined;

  const values = String(raw)
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (values.length === 0) return undefined;

  const resolved: string[] = [];
  for (const value of values) {
    const match = matchCanonical(value, allowed);
    if (!match) {
      errors.push(`Unknown ${field} value: "${value}"`);
      continue;
    }
    if (!resolved.includes(match)) resolved.push(match);
  }
  return resolved.length > 0 ? resolved : undefined;
}

function readLimit(raw: string | number | null | undefined, errors: string[]): number | undefined {
  if (raw === null || raw === undefined || raw === '') return undefined;
  const parsed = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_QUOTE_LIMIT) {
    errors.push(`limit must be an integer between 1 and ${MAX_QUOTE_LIMIT}`);
    return undefined;
  }
  return parsed;
}

function readDate(raw: string | null | undefined, field: string, errors: string[]): string | undefined {
  if (raw === null || raw === undefined || raw === '') return undefined;
  if (!DATE_RE.test(raw) || Number.isNaN(Date.parse(`${raw}T00:00:00Z`))) {
    errors.push(`${field} must be an ISO date (YYYY-MM-DD)`);
    return undefined;
  }
  return raw;
}

function pickFilters(
  get: (key: string) => string | null | undefined,
  errors: string[]
): CarbonPriceFilters {
  const limit = readLimit(get('limit'), errors);
  return {
    types: readList(get('types') ?? get('type'), 'types', CARBON_PROJECT_TYPES, errors) as
      | CarbonProjectType[]
      | undefined,
    regions: readList(get('regions') ?? get('region'), 'regions', CARBON_REGIONS, errors) as
      | CarbonRegion[]
      | undefined,
    standards: readList(
      get('standards') ?? get('standard'),
      'standards',
      CARBON_CERTIFICATION_STANDARDS,
      errors
    ) as CarbonCertificationStandard[] | undefined,
    projectIds: splitIds(get('projectIds') ?? get('projectId')),
    assetCodes: splitIds(get('assetCodes') ?? get('assetCode')),
    ...(limit !== undefined ? { limit } : {}),
  };
}

function splitIds(raw: string | null | undefined): string[] | undefined {
  if (raw === null || raw === undefined || raw === '') return undefined;
  const values = raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  return values.length > 0 ? values : undefined;
}

/** Validate a GET query string for `/api/v2/carbon-prices`. */
export function parseCarbonPriceQuery(params: URLSearchParams): ParseResult<CarbonPriceFilters> {
  const errors: string[] = [];
  const filters = pickFilters((key) => params.get(key), errors);
  return errors.length > 0 ? { ok: false, errors } : { ok: true, data: filters };
}

function asRecord(body: unknown): Record<string, unknown> | null {
  return body !== null && typeof body === 'object' && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : null;
}

function bodyList(
  value: unknown,
  field: string,
  allowed: readonly string[],
  errors: string[]
): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value) && typeof value !== 'string') {
    errors.push(`${field} must be a string or an array of strings`);
    return undefined;
  }
  const raw = Array.isArray(value) ? value : String(value).split(',');
  const resolved: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'string') {
      errors.push(`${field} must contain only strings`);
      continue;
    }
    const match = matchCanonical(entry.trim(), allowed);
    if (!match) {
      errors.push(`Unknown ${field} value: "${entry}"`);
      continue;
    }
    if (!resolved.includes(match)) resolved.push(match);
  }
  return resolved.length > 0 ? resolved : undefined;
}

function bodyIds(value: unknown, field: string, errors: string[]): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  const raw = Array.isArray(value) ? value : [value];
  const resolved: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'string' || entry.trim() === '') {
      errors.push(`${field} must contain only non-empty strings`);
      continue;
    }
    resolved.push(entry.trim());
  }
  return resolved.length > 0 ? resolved : undefined;
}

/** Validate a JSON body for `POST /api/v2/carbon-prices`. */
export function parseCarbonPriceRequest(body: unknown): ParseResult<CarbonPriceFilters> {
  const record = asRecord(body);
  if (!record) return { ok: false, errors: ['Request body must be a JSON object'] };

  const errors: string[] = [];
  const limit = readLimit(record.limit as number | string | undefined, errors);
  const filters: CarbonPriceFilters = {
    types: bodyList(record.types ?? record.type, 'types', CARBON_PROJECT_TYPES, errors) as
      | CarbonProjectType[]
      | undefined,
    regions: bodyList(record.regions ?? record.region, 'regions', CARBON_REGIONS, errors) as
      | CarbonRegion[]
      | undefined,
    standards: bodyList(
      record.standards ?? record.standard,
      'standards',
      CARBON_CERTIFICATION_STANDARDS,
      errors
    ) as CarbonCertificationStandard[] | undefined,
    projectIds: bodyIds(record.projectIds ?? record.projectId, 'projectIds', errors),
    assetCodes: bodyIds(record.assetCodes ?? record.assetCode, 'assetCodes', errors),
    ...(limit !== undefined ? { limit } : {}),
  };

  return errors.length > 0 ? { ok: false, errors } : { ok: true, data: filters };
}

/**
 * Validate a GET query string for `/api/v2/carbon-prices/history`.
 *
 * Deliberately narrow: the snapshot's type/region/standard filters do not apply
 * to a single asset's price history, so accepting them here would silently do
 * nothing.
 */
export function parseCarbonPriceHistoryQuery(
  params: URLSearchParams
): ParseResult<HistoryRequest> {
  const errors: string[] = [];
  const assetCode = (params.get('assetCode') ?? params.get('asset') ?? '').trim();
  if (!assetCode) errors.push('assetCode is required');

  const rawInterval = (params.get('interval') ?? 'day').trim();
  const interval = PRICE_INTERVALS.find((entry) => entry === rawInterval.toLowerCase());
  if (!interval) {
    errors.push(`interval must be one of: ${PRICE_INTERVALS.join(', ')}`);
  }

  const from = readDate(params.get('from'), 'from', errors);
  const to = readDate(params.get('to'), 'to', errors);
  if (from && to && from > to) errors.push('from must not be after to');

  if (errors.length > 0 || !interval) return { ok: false, errors };
  return {
    ok: true,
    data: { assetCode, interval, ...(from ? { from } : {}), ...(to ? { to } : {}) },
  };
}

// ── Deterministic series generation ───────────────────────────────────────────

/** FNV-1a — stable across runs so generated series never churn. */
function hashSeed(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function pseudoRandom(seed: number): () => number {
  let state = seed || 1;
  return () => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0xffffffff;
  };
}

function utcDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addUtcDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

/**
 * Build `days` daily closes ending on `endDate` (UTC). The final close is the
 * series' base price and earlier closes walk backwards with a bounded step, so
 * the newest point always matches the quoted market price.
 */
export function buildDailySeries(
  record: CarbonPriceSeriesRecord,
  days: number,
  endDate: Date
): CarbonPricePoint[] {
  const safeDays = Math.max(1, Math.floor(days));
  const random = pseudoRandom(hashSeed(record.assetCode));
  const end = new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate()));

  const prices: number[] = new Array(safeDays);
  const volumes: number[] = new Array(safeDays);
  prices[safeDays - 1] = round2(record.basePricePerTon);
  volumes[safeDays - 1] = Math.round(record.volume24h);

  for (let i = safeDays - 2; i >= 0; i--) {
    const drift = (random() - 0.5) * 0.02; // ±1% per day
    const previousStep = prices[i + 1] / round2(record.basePricePerTon);
    const meanReversion = (1 - previousStep) * 0.15;
    prices[i] = round2(prices[i + 1] * (1 + drift + meanReversion));
    volumes[i] = Math.round(record.volume24h * (0.6 + random() * 0.8));
  }

  return prices.map((pricePerTon, index) => ({
    at: utcDayKey(addUtcDays(end, index - (safeDays - 1))),
    pricePerTon,
    volume: volumes[index],
  }));
}

/** Collapse daily points into weekly (Monday-start) or monthly buckets. */
export function aggregateSeries(
  points: CarbonPricePoint[],
  interval: PriceInterval
): CarbonPricePoint[] {
  if (interval === 'day' || points.length === 0) return points.slice();

  const buckets = new Map<string, CarbonPricePoint>();
  for (const point of points) {
    const date = new Date(`${point.at}T00:00:00Z`);
    const key =
      interval === 'week'
        ? utcDayKey(addUtcDays(date, -((date.getUTCDay() + 6) % 7)))
        : `${point.at.slice(0, 7)}-01`;

    const existing = buckets.get(key);
    if (existing) {
      buckets.set(key, {
        at: key,
        // Close of the bucket is its last observation; volume accumulates.
        pricePerTon: point.pricePerTon,
        volume: existing.volume + point.volume,
      });
    } else {
      buckets.set(key, { at: key, pricePerTon: point.pricePerTon, volume: point.volume });
    }
  }

  return [...buckets.values()].sort((a, b) => (a.at < b.at ? -1 : 1));
}

function historyStats(points: CarbonPricePoint[]): CarbonPriceHistoryStats {
  if (points.length === 0) {
    return {
      points: 0,
      firstPrice: 0,
      lastPrice: 0,
      minPrice: 0,
      maxPrice: 0,
      averagePrice: 0,
      changePercent: 0,
      totalVolume: 0,
    };
  }

  const prices = points.map((point) => point.pricePerTon);
  const first = prices[0];
  const last = prices[prices.length - 1];
  return {
    points: points.length,
    firstPrice: first,
    lastPrice: last,
    minPrice: Math.min(...prices),
    maxPrice: Math.max(...prices),
    averagePrice: round2(prices.reduce((sum, price) => sum + price, 0) / prices.length),
    changePercent: first === 0 ? 0 : round2(((last - first) / first) * 100),
    totalVolume: points.reduce((sum, point) => sum + point.volume, 0),
  };
}

// ── Catalog source ────────────────────────────────────────────────────────────

/** Curated list of credit series exposed by the default source. */
export const CARBON_PRICE_CATALOG: readonly CarbonPriceSeriesRecord[] = [
  {
    assetCode: 'CARBON-PROJ-001-2025',
    projectId: 'PROJ-001',
    projectName: 'Amazon Reforestation - Brazil',
    projectType: 'Reforestation',
    region: 'latin-america',
    standard: 'Verra (VCS)',
    basePricePerTon: 28.4,
    volume24h: 14_820,
    updatedAt: '2026-09-26T12:00:00Z',
  },
  {
    assetCode: 'CARBON-PROJ-002-2024',
    projectId: 'PROJ-002',
    projectName: 'Solar Cookstoves - Kenya',
    projectType: 'Renewable Energy',
    region: 'africa',
    standard: 'Gold Standard',
    basePricePerTon: 12.75,
    volume24h: 31_400,
    updatedAt: '2026-09-26T12:00:00Z',
  },
  {
    assetCode: 'CARBON-PROJ-004-2024',
    projectId: 'PROJ-004',
    projectName: 'Mangrove Restoration - Indonesia',
    projectType: 'Mangrove Restoration',
    region: 'southeast-asia',
    standard: 'Plan Vivo',
    basePricePerTon: 42.5,
    volume24h: 6_120,
    updatedAt: '2026-09-26T12:00:00Z',
  },
  {
    assetCode: 'CARBON-PROJ-005-2025',
    projectId: 'PROJ-005',
    projectName: 'Regenerative Agriculture - Australia',
    projectType: 'Sustainable Agriculture',
    region: 'oceania',
    standard: 'Climate Action Reserve',
    basePricePerTon: 23.9,
    volume24h: 4_760,
    updatedAt: '2026-09-26T12:00:00Z',
  },
  {
    assetCode: 'CARBON-PROJ-007-2026',
    projectId: 'PROJ-007',
    projectName: 'Community Forest - Ghana',
    projectType: 'Reforestation',
    region: 'africa',
    standard: 'Gold Standard',
    basePricePerTon: 19.6,
    volume24h: 9_310,
    updatedAt: '2026-09-26T12:00:00Z',
  },
];

export interface CatalogSourceOptions {
  /** Clock used to anchor generated series; defaults to `new Date()`. */
  now?: () => Date;
  /** Days of daily history the source can serve. */
  historyDays?: number;
}

/** Adapt a catalog of listed series into the `CarbonPriceSource` contract. */
export function createCatalogPriceSource(
  catalog: readonly CarbonPriceSeriesRecord[] = CARBON_PRICE_CATALOG,
  options: CatalogSourceOptions = {}
): CarbonPriceSource {
  const now = options.now ?? (() => new Date());
  const historyDays = options.historyDays ?? MAX_HISTORY_DAYS;
  const seriesCache = new Map<string, CarbonPricePoint[]>();

  function seriesFor(assetCode: string): CarbonPricePoint[] | null {
    const record = catalog.find((entry) => entry.assetCode === assetCode);
    if (!record) return null;
    const cached = seriesCache.get(assetCode);
    if (cached) return cached;
    const series = buildDailySeries(record, historyDays, now());
    seriesCache.set(assetCode, series);
    return series;
  }

  return {
    sourceId: 'catalog',
    async listQuotes() {
      return catalog.map((entry) => ({ ...entry }));
    },
    async getDailySeries(assetCode: string, days: number) {
      const series = seriesFor(assetCode);
      if (!series) return null;
      const window = Math.min(Math.max(1, Math.floor(days)), series.length);
      return series.slice(series.length - window);
    },
  };
}

export const defaultCarbonPriceSource: CarbonPriceSource = createCatalogPriceSource();

// ── Aggregation ───────────────────────────────────────────────────────────────

function matchesFilters(record: CarbonPriceSeriesRecord, filters: CarbonPriceFilters): boolean {
  if (filters.types && !filters.types.includes(record.projectType)) return false;
  if (filters.regions && !filters.regions.includes(record.region)) return false;
  if (filters.standards && !filters.standards.includes(record.standard)) return false;
  if (filters.projectIds && !filters.projectIds.some((id) => normalizeToken(id) === normalizeToken(record.projectId)))
    return false;
  if (
    filters.assetCodes &&
    !filters.assetCodes.some((code) => normalizeToken(code) === normalizeToken(record.assetCode))
  )
    return false;
  return true;
}

function bucketize(
  quotes: CarbonPriceQuote[],
  keyOf: (quote: CarbonPriceQuote) => string
): CarbonPriceAggregateBucket[] {
  const buckets = new Map<string, { count: number; priceSum: number; volume: number }>();
  for (const quote of quotes) {
    const key = keyOf(quote);
    const bucket = buckets.get(key) ?? { count: 0, priceSum: 0, volume: 0 };
    bucket.count += 1;
    bucket.priceSum += quote.pricePerTon;
    bucket.volume += quote.volume24h;
    buckets.set(key, bucket);
  }

  return [...buckets.entries()]
    .map(([key, bucket]) => ({
      key,
      quoteCount: bucket.count,
      averagePricePerTon: round2(bucket.priceSum / bucket.count),
      totalVolume24h: bucket.volume,
    }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

export interface AggregateOptions {
  source?: CarbonPriceSource;
  now?: Date;
}

/**
 * Build the real-time snapshot: quotes that match `filters` plus pre-rolled
 * aggregates by type, region and standard for chart-friendly consumption.
 */
export async function aggregateCarbonPrices(
  filters: CarbonPriceFilters = {},
  options: AggregateOptions = {}
): Promise<CarbonPriceSnapshot> {
  const source = options.source ?? defaultCarbonPriceSource;
  const now = options.now ?? new Date();

  let records: CarbonPriceSeriesRecord[];
  try {
    records = await source.listQuotes();
  } catch (error) {
    throw new CarbonPriceError('Failed to load carbon price data', [
      { sourceId: source.sourceId, message: error instanceof Error ? error.message : String(error) },
    ]);
  }

  const matched = records.filter((record) => matchesFilters(record, filters));
  const quotes: CarbonPriceQuote[] = [];

  for (const record of matched) {
    let series: CarbonPricePoint[] | null = null;
    try {
      series = await source.getDailySeries(record.assetCode, 2);
    } catch (error) {
      throw new CarbonPriceError('Failed to load carbon price history', [
        { sourceId: source.sourceId, message: error instanceof Error ? error.message : String(error) },
      ]);
    }

    const last = series?.[series.length - 1];
    const pricePerTon = round2(last?.pricePerTon ?? record.basePricePerTon);
    const previousClose = round2(series?.[series.length - 2]?.pricePerTon ?? pricePerTon);
    const change24hAmount = round2(pricePerTon - previousClose);

    quotes.push({
      assetCode: record.assetCode,
      projectId: record.projectId,
      projectName: record.projectName,
      projectType: record.projectType,
      region: record.region,
      standard: record.standard,
      currency: CARBON_PRICE_CURRENCY,
      pricePerTon,
      previousClose,
      change24hAmount,
      change24hPercent:
        previousClose === 0 ? 0 : round2((change24hAmount / previousClose) * 100),
      volume24h: last?.volume ?? record.volume24h,
      updatedAt: record.updatedAt,
    });
  }

  quotes.sort((a, b) => b.volume24h - a.volume24h);
  const limited = filters.limit ? quotes.slice(0, filters.limit) : quotes;

  return {
    generatedAt: now.toISOString(),
    currency: CARBON_PRICE_CURRENCY,
    source: source.sourceId,
    filters,
    count: limited.length,
    quotes: limited,
    aggregates: {
      averagePricePerTon:
        limited.length === 0
          ? 0
          : round2(limited.reduce((sum, quote) => sum + quote.pricePerTon, 0) / limited.length),
      totalVolume24h: limited.reduce((sum, quote) => sum + quote.volume24h, 0),
      byType: bucketize(limited, (quote) => quote.projectType),
      byRegion: bucketize(limited, (quote) => quote.region),
      byStandard: bucketize(limited, (quote) => quote.standard),
    },
  };
}

export interface HistoryOptions extends AggregateOptions {
  now?: Date;
}

/**
 * Historical series for one asset. Returns `null` when the asset is unlisted so
 * the route can answer 404 without treating it as a source failure.
 */
export async function getCarbonPriceHistory(
  request: HistoryRequest,
  options: HistoryOptions = {}
): Promise<CarbonPriceHistory | null> {
  const source = options.source ?? defaultCarbonPriceSource;
  const now = options.now ?? new Date();

  const to = request.to ?? utcDayKey(now);
  let from = request.from;
  if (!from) {
    from = utcDayKey(addUtcDays(new Date(`${to}T00:00:00Z`), -(DEFAULT_HISTORY_DAYS - 1)));
  }

  const spanDays =
    Math.floor(
      (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000
    ) + 1;

  let series: CarbonPricePoint[] | null;
  try {
    series = await source.getDailySeries(request.assetCode, Math.min(spanDays, MAX_HISTORY_DAYS));
  } catch (error) {
    throw new CarbonPriceError('Failed to load carbon price history', [
      { sourceId: source.sourceId, message: error instanceof Error ? error.message : String(error) },
    ]);
  }

  if (!series) return null;

  const windowed = series.filter((point) => point.at >= from && point.at <= to);
  const points = aggregateSeries(windowed, request.interval);

  return {
    assetCode: request.assetCode,
    interval: request.interval,
    currency: CARBON_PRICE_CURRENCY,
    from,
    to,
    points,
    stats: historyStats(points),
  };
}
