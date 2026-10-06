/**
 * Buyer analytics service — Issue #1413
 *
 * Analytics dashboard for corporate carbon buyers: total offset purchased,
 * effective cost per tonne, purchased co-benefits, per-project supply chain
 * (chain of custody), and a period-over-period trend analysis.
 *
 * This service deliberately builds on the offset-aggregation layer
 * (`lib/api/offset-aggregation.ts`) rather than inventing a new data source:
 * it loads the same `SourcePosition` feeds (Stellar credit positions + tree
 * registry sequestration), then reshapes them for a buyer's dashboard. The
 * default adapters are the ones already shipped by the offset-aggregation
 * service, so this endpoint is hermetic and consistent with
 * `/api/v2/portfolio/offsets`.
 *
 * The aggregation is a pure function over the loaded positions, so it is
 * unit-testable without a database or network.
 */

import { z } from 'zod';
import {
  DEFAULT_PORTFOLIO_SOURCES,
  OFFSET_PLATFORMS,
  type OffsetAssetType,
  type OffsetPlatform,
  type OffsetSourceStatus,
  type OffsetStatusFilter,
  type PortfolioSource,
  type SourcePosition,
} from '@/lib/api/offset-aggregation';
import { buyerLedgerSource } from '@/lib/api/buyer-offset-ledger';
import { mockCarbonProjects } from '@/lib/api/mock/carbonProjects';
import type { CarbonProject } from '@/lib/types/carbon';

// ── Request shape & validation ────────────────────────────────────────────────

/**
 * Stellar Ed25519 public keys always start with 'G' and are 56 characters
 * (base32 charset), matching `lib/api/offset-aggregation.ts`.
 */
const STELLAR_PUBLIC_KEY_REGEX = /^G[A-Z2-7]{55}$/;

export const ANALYTICS_INTERVALS = ['month', 'quarter'] as const;
export type AnalyticsInterval = (typeof ANALYTICS_INTERVALS)[number];

/**
 * Which position feeds to aggregate.
 *
 * `synthetic` (default) keeps the deterministic catalogue-backed feeds that
 * shipped with this endpoint, so existing callers keep working with no
 * database. `ledger` reads the buyer's real purchase lots and retirement
 * receipts from PostgreSQL (`lib/api/buyer-offset-ledger.ts`). `all` combines
 * both, which will double-count tonnes for a buyer who has both.
 */
export const ANALYTICS_DATA_SOURCES = ['synthetic', 'ledger', 'all'] as const;
export type AnalyticsDataSource = (typeof ANALYTICS_DATA_SOURCES)[number];

const isoDateSchema = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), 'must be an ISO 8601 date string');

export const buyerAnalyticsRequestSchema = z.object({
  /** Buyer identity/scope. Opaque id — never an on-chain secret. */
  buyerId: z.string().min(1, 'buyerId is required').max(128),
  /** Optional Stellar account whose balances back the buyer's positions. */
  account: z
    .string()
    .regex(STELLAR_PUBLIC_KEY_REGEX, 'account must be a 56-character Stellar public key')
    .optional(),
  /** Restrict the view to these platforms. Omit for all platforms. */
  platforms: z.array(z.enum(OFFSET_PLATFORMS)).min(1).optional(),
  /** Restrict the view to these project ids. Omit for all projects. */
  projectIds: z.array(z.string().min(1)).min(1).optional(),
  /** Status filter; defaults to `all`. */
  status: z.enum(['all', 'active', 'retired']).optional(),
  /** Inclusive lower bound on a position's recordedAt timestamp. */
  from: isoDateSchema.optional(),
  /** Inclusive upper bound on a position's recordedAt timestamp. */
  to: isoDateSchema.optional(),
  /** Trend bucket size; defaults to `month`. */
  interval: z.enum(ANALYTICS_INTERVALS).optional(),
  /** Which feeds to aggregate; defaults to `synthetic`. */
  dataSource: z.enum(ANALYTICS_DATA_SOURCES).optional(),
});

export type BuyerAnalyticsRequest = z.infer<typeof buyerAnalyticsRequestSchema>;

export type BuyerAnalyticsParseResult =
  { ok: true; data: BuyerAnalyticsRequest } | { ok: false; errors: string[] };

/**
 * Validates an already-parsed request object (POST bodies, internal callers).
 * Returns a flat list of field errors for the API's 400 response body.
 */
export function parseBuyerAnalyticsRequest(input: unknown): BuyerAnalyticsParseResult {
  const result = buyerAnalyticsRequestSchema.safeParse(input);

  if (!result.success) {
    return {
      ok: false,
      errors: result.error.issues.map((issue) => {
        const path = issue.path.join('.');
        return path ? `${path}: ${issue.message}` : issue.message;
      }),
    };
  }

  const data = result.data;

  if (data.from && data.to && Date.parse(data.from) > Date.parse(data.to)) {
    return { ok: false, errors: ['to: must be greater than or equal to from'] };
  }

  return { ok: true, data };
}

function splitCommaSeparated(value: string | null): string[] | undefined {
  if (!value) return undefined;
  const parts = value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : undefined;
}

/**
 * Builds and validates a request from `GET` query parameters.
 * Accepts `buyerId` (or the shorter `buyer` alias).
 */
export function parseBuyerAnalyticsQuery(searchParams: URLSearchParams): BuyerAnalyticsParseResult {
  const raw: Record<string, unknown> = {
    buyerId: searchParams.get('buyerId') ?? searchParams.get('buyer') ?? undefined,
  };

  const account = searchParams.get('account');
  if (account !== null && account !== '') raw.account = account;

  const platforms = splitCommaSeparated(searchParams.get('platforms'));
  if (platforms) raw.platforms = platforms;

  const projectIds = splitCommaSeparated(searchParams.get('projectIds'));
  if (projectIds) raw.projectIds = projectIds;

  const status = searchParams.get('status');
  if (status !== null && status !== '') raw.status = status;

  const from = searchParams.get('from');
  if (from !== null && from !== '') raw.from = from;

  const to = searchParams.get('to');
  if (to !== null && to !== '') raw.to = to;

  const interval = searchParams.get('interval');
  if (interval !== null && interval !== '') raw.interval = interval;

  const dataSource = searchParams.get('dataSource');
  if (dataSource !== null && dataSource !== '') raw.dataSource = dataSource;

  return parseBuyerAnalyticsRequest(raw);
}

// ── Response shapes ───────────────────────────────────────────────────────────

export interface BuyerOffsetTotals {
  /** Number of distinct purchases/positions in scope. */
  purchaseCount: number;
  /** Number of distinct projects purchased from. */
  projectCount: number;
  /** Total offsets purchased, in tonnes CO2e (credits + sequestration). */
  totalTonnes: number;
  /** Split of `totalTonnes` by asset type. */
  creditTonnes: number;
  sequestrationTonnes: number;
  activeTonnes: number;
  retiredTonnes: number;
  /** Total amount spent, in USD, across positions priced in USD. */
  totalCostUsd: number;
  /** Tonnes that carried a USD price (denominator for cost per tonne). */
  pricedTonnes: number;
  /** Effective (weighted-average) cost per tonne across USD-priced positions. */
  costPerTonUsd: number;
  /** Lowest and highest unit price observed across USD-priced positions. */
  minCostPerTonUsd: number;
  maxCostPerTonUsd: number;
  /**
   * Spend split by currency. The real ledger prices purchases in USDC by
   * default, so non-USD spend is reported here rather than being folded into
   * the `*Usd` fields above.
   */
  costByCurrency: CurrencySpend[];
  retirementCount: number;
}

export interface CurrencySpend {
  currency: string;
  tonnes: number;
  cost: number;
  costPerTon: number;
}

export interface CoBenefitSummary {
  name: string;
  /** How many distinct purchased projects provide this co-benefit. */
  projectCount: number;
  /** Tonnes purchased from projects that provide this co-benefit. */
  tonnes: number;
  /** Share of the buyer's total purchased tonnes, 0–100. */
  sharePercentage: number;
}

export type SupplyChainStageName =
  'origination' | 'verification' | 'issuance' | 'purchase' | 'retirement';

export type SupplyChainStageStatus = 'complete' | 'pending' | 'not-applicable';

export interface SupplyChainStage {
  stage: SupplyChainStageName;
  status: SupplyChainStageStatus;
  /** ISO timestamp when the stage was reached (where known). */
  at?: string;
  /** Human-readable detail for the dashboard. */
  detail?: string;
}

export interface SupplyChainProject {
  projectId: string;
  projectName: string;
  platform: OffsetPlatform;
  assetType: OffsetAssetType;
  /**
   * Free-form project type: catalogue types are the `ProjectType` union, but a
   * real ledger can carry any string retired against the position.
   */
  projectType: string | null;
  location: string | null;
  vintages: number[];
  coBenefits: string[];
  purchaseCount: number;
  tonnes: number;
  retiredTonnes: number;
  costUsd: number;
  costPerTonUsd: number;
  /** Spend split by currency; only ever more than one entry for real ledgers. */
  costByCurrency: CurrencySpend[];
  /** First and most recent purchase timestamps. */
  firstPurchasedAt: string;
  lastPurchasedAt: string;
  /** Ordered chain of custody for this project's purchased offsets. */
  stages: SupplyChainStage[];
}

export type TrendDirection = 'up' | 'down' | 'flat';

export interface BuyerTrendPoint {
  /** Machine-readable bucket, e.g. `2026-01` or `2026-Q1`. */
  period: string;
  /** Display label, e.g. `Jan 2026` or `Q1 2026`. */
  label: string;
  purchaseCount: number;
  tonnes: number;
  costUsd: number;
  costPerTonUsd: number;
  /** Spend split by currency for this period. */
  costByCurrency: CurrencySpend[];
}

export interface BuyerTrendAnalysis {
  interval: AnalyticsInterval;
  /** Direction of the most recent bucket vs the prior bucket. */
  direction: TrendDirection;
  tonnesChangePercentage: number;
  costPerTonChangePercentage: number;
  points: BuyerTrendPoint[];
}

export interface BuyerAnalyticsSummary {
  buyerId: string;
  account: string | null;
  generatedAt: string;
  filters: {
    platforms: OffsetPlatform[] | null;
    projectIds: string[] | null;
    status: OffsetStatusFilter;
    from: string | null;
    to: string | null;
    interval: AnalyticsInterval;
    dataSource: AnalyticsDataSource;
  };
  totals: BuyerOffsetTotals;
  coBenefits: CoBenefitSummary[];
  supplyChain: SupplyChainProject[];
  trends: BuyerTrendAnalysis;
  sourceStatuses: OffsetSourceStatus[];
  /** Positions dropped because they were malformed (observability). */
  invalidPositionCount: number;
}

/** Thrown when every source fails, so the route can return a gateway error. */
export class BuyerAnalyticsError extends Error {
  readonly failures: { sourceId: string; message: string }[];

  constructor(message: string, failures: { sourceId: string; message: string }[]) {
    super(message);
    this.name = 'BuyerAnalyticsError';
    this.failures = failures;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function roundTonnes(value: number): number {
  return parseFloat(value.toFixed(4));
}

function roundUsd(value: number): number {
  return parseFloat(value.toFixed(2));
}

function roundPct(value: number): number {
  return parseFloat(value.toFixed(2));
}

function percentageChange(previous: number, current: number): number {
  if (previous === 0) return current === 0 ? 0 : 100;
  return ((current - previous) / previous) * 100;
}

function directionFor(change: number): TrendDirection {
  if (change > 0.5) return 'up';
  if (change < -0.5) return 'down';
  return 'flat';
}

/** Price carried by a position, falling back to price × quantity. */
function positionCostUsd(position: SourcePosition): number {
  if (typeof position.valueUsd === 'number') return position.valueUsd;
  if (typeof position.pricePerTon === 'number') {
    return position.quantityTonnes * position.pricePerTon;
  }
  return 0;
}

/** Spend currency of a position; positions without one are treated as USD. */
function positionCurrency(position: SourcePosition): string {
  return (position.currency ?? 'USD').toUpperCase();
}

function isUsdPriced(position: SourcePosition): boolean {
  return isPriced(position) && positionCurrency(position) === 'USD';
}

/**
 * Tonnes of a position already retired. Sources that predate partial
 * retirement only set `status`, so a `retired` position without an explicit
 * `retiredTonnes` counts as fully retired.
 */
function retiredTonnesOf(position: SourcePosition): number {
  if (typeof position.retiredTonnes === 'number') {
    return Math.min(Math.max(position.retiredTonnes, 0), position.quantityTonnes);
  }
  return position.status === 'retired' ? position.quantityTonnes : 0;
}

/** Accumulates cost per currency so non-USD spend is never labelled USD. */
class CurrencySpendAccumulator {
  private readonly buckets = new Map<string, { tonnes: number; cost: number }>();

  add(position: SourcePosition, cost: number): void {
    const currency = positionCurrency(position);
    const bucket = this.buckets.get(currency) ?? { tonnes: 0, cost: 0 };
    bucket.tonnes += position.quantityTonnes;
    bucket.cost += cost;
    this.buckets.set(currency, bucket);
  }

  toSortedArray(): CurrencySpend[] {
    return [...this.buckets.entries()]
      .map(([currency, bucket]) => ({
        currency,
        tonnes: roundTonnes(bucket.tonnes),
        cost: roundUsd(bucket.cost),
        costPerTon: bucket.tonnes > 0 ? roundUsd(bucket.cost / bucket.tonnes) : 0,
      }))
      .sort((a, b) => b.cost - a.cost || a.currency.localeCompare(b.currency));
  }
}

function isPriced(position: SourcePosition): boolean {
  return typeof position.valueUsd === 'number' || typeof position.pricePerTon === 'number';
}

function unitPrice(position: SourcePosition): number {
  if (typeof position.pricePerTon === 'number') return position.pricePerTon;
  if (typeof position.valueUsd === 'number' && position.quantityTonnes > 0) {
    return position.valueUsd / position.quantityTonnes;
  }
  return 0;
}

function isValidPosition(position: SourcePosition): boolean {
  return (
    typeof position.positionId === 'string' &&
    position.positionId.length > 0 &&
    typeof position.projectId === 'string' &&
    position.projectId.length > 0 &&
    typeof position.quantityTonnes === 'number' &&
    Number.isFinite(position.quantityTonnes) &&
    position.quantityTonnes >= 0 &&
    typeof position.recordedAt === 'string' &&
    !Number.isNaN(Date.parse(position.recordedAt))
  );
}

function matchesFilters(position: SourcePosition, request: BuyerAnalyticsRequest): boolean {
  if (request.platforms?.length && !request.platforms.includes(position.platform)) return false;
  if (request.projectIds?.length && !request.projectIds.includes(position.projectId)) return false;

  const status = request.status ?? 'all';
  if (status !== 'all' && position.status !== status) return false;

  const recordedAt = Date.parse(position.recordedAt);
  if (request.from && recordedAt < Date.parse(request.from)) return false;
  if (request.to && recordedAt > Date.parse(request.to)) return false;

  return true;
}

const PROJECT_BY_ID = new Map<string, CarbonProject>(
  mockCarbonProjects.map((project) => [project.id, project])
);

function projectFor(projectId: string): CarbonProject | undefined {
  return PROJECT_BY_ID.get(projectId);
}

// ── Source loading ────────────────────────────────────────────────────────────

export interface LoadedBuyerPositions {
  positions: SourcePosition[];
  sourceStatuses: OffsetSourceStatus[];
  invalidPositionCount: number;
}

/**
 * Loads positions from every source, mirroring the partial-failure semantics of
 * `aggregatePortfolioOffsets`: a failing source is reported as `error` while the
 * others still contribute; if every source fails a `BuyerAnalyticsError` is
 * thrown.
 */
async function loadBuyerPositions(
  request: BuyerAnalyticsRequest,
  sources: PortfolioSource[],
  asOf: Date
): Promise<LoadedBuyerPositions> {
  const results = await Promise.all(
    sources.map(async (source) => {
      try {
        const positions = await source.loadPositions({
          request: {
            portfolioId: request.buyerId,
            account: request.account,
            platforms: request.platforms,
            projectIds: request.projectIds,
            status: request.status,
            from: request.from,
            to: request.to,
          },
          asOf,
        });
        return { source, positions, error: null as string | null };
      } catch (error) {
        return {
          source,
          positions: [] as SourcePosition[],
          error: error instanceof Error ? error.message : String(error),
        };
      }
    })
  );

  const failed = results.filter((result) => result.error !== null);
  if (sources.length > 0 && failed.length === sources.length) {
    throw new BuyerAnalyticsError(
      'All buyer analytics sources failed',
      failed.map((result) => ({
        sourceId: result.source.id,
        message: result.error as string,
      }))
    );
  }

  const sourceStatuses: OffsetSourceStatus[] = results.map((result) => ({
    sourceId: result.source.id,
    label: result.source.label,
    status: result.error ? 'error' : 'ok',
    positionCount: result.positions.length,
    ...(result.error ? { error: result.error } : {}),
  }));

  const allPositions = results.flatMap((result) => result.positions);
  const validPositions = allPositions.filter(isValidPosition);
  const invalidPositionCount = allPositions.length - validPositions.length;

  return { positions: validPositions, sourceStatuses, invalidPositionCount };
}

// ── Aggregation ───────────────────────────────────────────────────────────────

function buildTotals(positions: SourcePosition[]): BuyerOffsetTotals {
  let totalTonnes = 0;
  let creditTonnes = 0;
  let sequestrationTonnes = 0;
  let activeTonnes = 0;
  let retiredTonnes = 0;
  let totalCostUsd = 0;
  let pricedTonnes = 0;
  let retirementCount = 0;
  const projectIds = new Set<string>();
  const currencySpend = new CurrencySpendAccumulator();
  let minCostPerTonUsd = Number.POSITIVE_INFINITY;
  let maxCostPerTonUsd = 0;

  for (const position of positions) {
    totalTonnes += position.quantityTonnes;
    if (position.assetType === 'sequestration') {
      sequestrationTonnes += position.quantityTonnes;
    } else {
      creditTonnes += position.quantityTonnes;
    }

    // A lot can be partly retired, so split by real retired tonnage rather than
    // by status; the remainder stays active.
    const retiredForPosition = retiredTonnesOf(position);
    retiredTonnes += retiredForPosition;
    activeTonnes += position.quantityTonnes - retiredForPosition;
    if (retiredForPosition > 0) retirementCount += 1;

    projectIds.add(position.projectId);

    if (isPriced(position)) {
      const cost = positionCostUsd(position);
      currencySpend.add(position, cost);

      if (isUsdPriced(position)) {
        totalCostUsd += cost;
        pricedTonnes += position.quantityTonnes;
        const price = unitPrice(position);
        if (price > 0) {
          minCostPerTonUsd = Math.min(minCostPerTonUsd, price);
          maxCostPerTonUsd = Math.max(maxCostPerTonUsd, price);
        }
      }
    }
  }

  return {
    purchaseCount: positions.length,
    projectCount: projectIds.size,
    totalTonnes: roundTonnes(totalTonnes),
    creditTonnes: roundTonnes(creditTonnes),
    sequestrationTonnes: roundTonnes(sequestrationTonnes),
    activeTonnes: roundTonnes(activeTonnes),
    retiredTonnes: roundTonnes(retiredTonnes),
    totalCostUsd: roundUsd(totalCostUsd),
    pricedTonnes: roundTonnes(pricedTonnes),
    costPerTonUsd: pricedTonnes > 0 ? roundUsd(totalCostUsd / pricedTonnes) : 0,
    minCostPerTonUsd: Number.isFinite(minCostPerTonUsd) ? roundUsd(minCostPerTonUsd) : 0,
    maxCostPerTonUsd: roundUsd(maxCostPerTonUsd),
    costByCurrency: currencySpend.toSortedArray(),
    retirementCount,
  };
}

/**
 * Co-benefits recorded against the position itself win, because a real
 * retirement receipt snapshots the co-benefits that were actually claimed.
 * The project catalogue is the fallback for positions that carry none.
 */
function coBenefitsOf(position: SourcePosition): string[] {
  if (position.coBenefits && position.coBenefits.length > 0) return position.coBenefits;
  return projectFor(position.projectId)?.coBenefits ?? [];
}

function buildCoBenefits(positions: SourcePosition[], totalTonnes: number): CoBenefitSummary[] {
  const buckets = new Map<string, { projectIds: Set<string>; tonnes: number }>();

  for (const position of positions) {
    for (const benefit of coBenefitsOf(position)) {
      const bucket = buckets.get(benefit) ?? { projectIds: new Set<string>(), tonnes: 0 };
      bucket.projectIds.add(position.projectId);
      bucket.tonnes += position.quantityTonnes;
      buckets.set(benefit, bucket);
    }
  }

  return [...buckets.entries()]
    .map(([name, bucket]) => ({
      name,
      projectCount: bucket.projectIds.size,
      tonnes: roundTonnes(bucket.tonnes),
      sharePercentage: totalTonnes > 0 ? roundPct((bucket.tonnes / totalTonnes) * 100) : 0,
    }))
    .sort((a, b) => b.tonnes - a.tonnes || a.name.localeCompare(b.name));
}

interface ProjectBucket {
  projectId: string;
  projectName: string;
  platform: OffsetPlatform;
  assetType: OffsetAssetType;
  projectType: string | null;
  location: string | null;
  coBenefits: string[];
  vintages: Set<number>;
  purchaseCount: number;
  tonnes: number;
  retiredTonnes: number;
  costUsd: number;
  pricedTonnes: number;
  currencySpend: CurrencySpendAccumulator;
  firstPurchasedAt: string;
  lastPurchasedAt: string;
  latestRetirementAt: string | null;
  recordedAt: string[];
}

function buildSupplyChain(positions: SourcePosition[]): SupplyChainProject[] {
  const buckets = new Map<string, ProjectBucket>();

  for (const position of positions) {
    const existing = buckets.get(position.projectId);
    const bucket: ProjectBucket = existing ?? {
      projectId: position.projectId,
      projectName: position.projectName,
      platform: position.platform,
      assetType: position.assetType,
      projectType: position.projectType ?? null,
      location: position.location ?? null,
      coBenefits: [],
      vintages: new Set<number>(),
      purchaseCount: 0,
      tonnes: 0,
      retiredTonnes: 0,
      costUsd: 0,
      pricedTonnes: 0,
      currencySpend: new CurrencySpendAccumulator(),
      firstPurchasedAt: position.recordedAt,
      lastPurchasedAt: position.recordedAt,
      latestRetirementAt: null,
      recordedAt: [],
    };

    bucket.purchaseCount += 1;
    bucket.tonnes += position.quantityTonnes;
    if (typeof position.vintage === 'number') bucket.vintages.add(position.vintage);
    bucket.retiredTonnes += retiredTonnesOf(position);

    if (position.projectType && !bucket.projectType) bucket.projectType = position.projectType;
    if (position.location && !bucket.location) bucket.location = position.location;
    for (const benefit of coBenefitsOf(position)) {
      if (!bucket.coBenefits.includes(benefit)) bucket.coBenefits.push(benefit);
    }

    if (isPriced(position)) {
      const cost = positionCostUsd(position);
      bucket.currencySpend.add(position, cost);
      if (isUsdPriced(position)) {
        bucket.costUsd += cost;
        bucket.pricedTonnes += position.quantityTonnes;
      }
    }

    bucket.recordedAt.push(position.recordedAt);
    if (Date.parse(position.recordedAt) < Date.parse(bucket.firstPurchasedAt)) {
      bucket.firstPurchasedAt = position.recordedAt;
    }
    if (Date.parse(position.recordedAt) > Date.parse(bucket.lastPurchasedAt)) {
      bucket.lastPurchasedAt = position.recordedAt;
    }

    const retiredAt = position.retirement?.retiredAt;
    if (
      retiredAt &&
      (!bucket.latestRetirementAt || Date.parse(retiredAt) > Date.parse(bucket.latestRetirementAt))
    ) {
      bucket.latestRetirementAt = retiredAt;
    }

    buckets.set(position.projectId, bucket);
  }

  return [...buckets.values()]
    .map((bucket) => {
      const project = projectFor(bucket.projectId);
      const projectType = bucket.projectType ?? project?.type ?? null;
      const location = bucket.location ?? project?.location ?? null;
      const coBenefits = [...bucket.coBenefits];
      const vintages = [...bucket.vintages].sort((a, b) => a - b);
      const issuanceAt =
        vintages.length > 0 ? new Date(Date.UTC(vintages[0], 0, 1)).toISOString() : undefined;

      const allRetired = bucket.retiredTonnes > 0 && bucket.retiredTonnes >= bucket.tonnes - 1e-9;
      const hasMetadata = Boolean(projectType || location);

      const stages: SupplyChainStage[] = [
        {
          stage: 'origination',
          status: hasMetadata ? 'complete' : 'pending',
          detail: hasMetadata
            ? [projectType, location].filter(Boolean).join(' · ')
            : 'Project metadata unavailable',
        },
        {
          stage: 'verification',
          status: bucket.platform === 'unverified' ? 'pending' : 'complete',
          detail:
            bucket.platform === 'unverified'
              ? 'Awaiting registry verification'
              : `Verified by ${bucket.platform}`,
        },
        {
          stage: 'issuance',
          status: vintages.length > 0 ? 'complete' : 'pending',
          at: issuanceAt,
          detail: vintages.length > 0 ? `Vintage ${vintages.join(', ')}` : 'Not yet issued',
        },
        {
          stage: 'purchase',
          status: 'complete',
          at: bucket.firstPurchasedAt,
          detail: `${bucket.purchaseCount} purchase${bucket.purchaseCount === 1 ? '' : 's'}`,
        },
        bucket.assetType === 'sequestration'
          ? {
              stage: 'retirement',
              status: 'not-applicable',
              detail: 'Sequestration positions are not retired',
            }
          : {
              stage: 'retirement',
              status: allRetired ? 'complete' : 'pending',
              at: bucket.latestRetirementAt ?? undefined,
              detail: allRetired
                ? `${roundTonnes(bucket.retiredTonnes)} t retired`
                : bucket.retiredTonnes > 0
                  ? `${roundTonnes(bucket.retiredTonnes)} t retired, remainder active`
                  : 'Not yet retired',
            },
      ];

      return {
        projectId: bucket.projectId,
        projectName: bucket.projectName,
        platform: bucket.platform,
        assetType: bucket.assetType,
        projectType,
        location,
        vintages,
        coBenefits,
        purchaseCount: bucket.purchaseCount,
        tonnes: roundTonnes(bucket.tonnes),
        retiredTonnes: roundTonnes(bucket.retiredTonnes),
        costUsd: roundUsd(bucket.costUsd),
        costPerTonUsd: bucket.pricedTonnes > 0 ? roundUsd(bucket.costUsd / bucket.pricedTonnes) : 0,
        costByCurrency: bucket.currencySpend.toSortedArray(),
        firstPurchasedAt: bucket.firstPurchasedAt,
        lastPurchasedAt: bucket.lastPurchasedAt,
        stages,
      } satisfies SupplyChainProject;
    })
    .sort((a, b) => b.tonnes - a.tonnes || a.projectId.localeCompare(b.projectId));
}

const MONTH_LABELS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

function bucketKey(iso: string, interval: AnalyticsInterval): { period: string; label: string } {
  const date = new Date(iso);
  const year = date.getUTCFullYear();
  if (interval === 'quarter') {
    const quarter = Math.floor(date.getUTCMonth() / 3) + 1;
    return { period: `${year}-Q${quarter}`, label: `Q${quarter} ${year}` };
  }
  const month = date.getUTCMonth();
  const mm = String(month + 1).padStart(2, '0');
  return { period: `${year}-${mm}`, label: `${MONTH_LABELS[month]} ${year}` };
}

function buildTrends(positions: SourcePosition[], interval: AnalyticsInterval): BuyerTrendAnalysis {
  const buckets = new Map<
    string,
    {
      label: string;
      purchaseCount: number;
      tonnes: number;
      costUsd: number;
      pricedTonnes: number;
      currencySpend: CurrencySpendAccumulator;
    }
  >();

  for (const position of positions) {
    const { period, label } = bucketKey(position.recordedAt, interval);
    const bucket = buckets.get(period) ?? {
      label,
      purchaseCount: 0,
      tonnes: 0,
      costUsd: 0,
      pricedTonnes: 0,
      currencySpend: new CurrencySpendAccumulator(),
    };

    bucket.purchaseCount += 1;
    bucket.tonnes += position.quantityTonnes;
    if (isPriced(position)) {
      const cost = positionCostUsd(position);
      bucket.currencySpend.add(position, cost);
      if (isUsdPriced(position)) {
        bucket.costUsd += cost;
        bucket.pricedTonnes += position.quantityTonnes;
      }
    }

    buckets.set(period, bucket);
  }

  const points: BuyerTrendPoint[] = [...buckets.entries()]
    .map(([period, bucket]) => ({
      period,
      label: bucket.label,
      purchaseCount: bucket.purchaseCount,
      tonnes: roundTonnes(bucket.tonnes),
      costUsd: roundUsd(bucket.costUsd),
      costPerTonUsd: bucket.pricedTonnes > 0 ? roundUsd(bucket.costUsd / bucket.pricedTonnes) : 0,
      costByCurrency: bucket.currencySpend.toSortedArray(),
    }))
    .sort((a, b) => a.period.localeCompare(b.period));

  const latest = points[points.length - 1];
  const previous = points[points.length - 2];

  const tonnesChangePercentage = previous ? percentageChange(previous.tonnes, latest.tonnes) : 0;
  const costPerTonChangePercentage = previous
    ? percentageChange(previous.costPerTonUsd, latest.costPerTonUsd)
    : 0;

  return {
    interval,
    direction: directionFor(tonnesChangePercentage),
    tonnesChangePercentage: roundPct(tonnesChangePercentage),
    costPerTonChangePercentage: roundPct(costPerTonChangePercentage),
    points,
  };
}

export interface AggregateBuyerAnalyticsOptions {
  /** Override the source adapters (tests, or a caller with live adapters). */
  sources?: PortfolioSource[];
  /** Injectable clock so responses are deterministic in tests. */
  now?: Date;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Resolves the source adapters for a data source selection.
 *
 * `synthetic` keeps the hermetic catalogue feeds, `ledger` reads the buyer's
 * real purchase/retirement rows from PostgreSQL, and `all` combines them.
 */
export function resolveBuyerAnalyticsSources(
  dataSource: AnalyticsDataSource = 'synthetic'
): PortfolioSource[] {
  if (dataSource === 'ledger') return [buyerLedgerSource];
  if (dataSource === 'all') return [...DEFAULT_PORTFOLIO_SOURCES, buyerLedgerSource];
  return DEFAULT_PORTFOLIO_SOURCES;
}

/**
 * Loads the buyer's offset positions, filters them, and returns the full
 * analytics view: totals, cost per tonne, co-benefits, per-project supply
 * chain, and trend analysis.
 */
export async function aggregateBuyerAnalytics(
  request: BuyerAnalyticsRequest,
  options: AggregateBuyerAnalyticsOptions = {}
): Promise<BuyerAnalyticsSummary> {
  const dataSource = request.dataSource ?? 'synthetic';
  const sources = options.sources ?? resolveBuyerAnalyticsSources(dataSource);
  const asOf = options.now ?? new Date();
  const interval = request.interval ?? 'month';

  const { positions, sourceStatuses, invalidPositionCount } = await loadBuyerPositions(
    request,
    sources,
    asOf
  );

  const filtered = positions.filter((position) => matchesFilters(position, request));

  const totals = buildTotals(filtered);
  const coBenefits = buildCoBenefits(filtered, totals.totalTonnes);
  const supplyChain = buildSupplyChain(filtered);
  const trends = buildTrends(filtered, interval);

  return {
    buyerId: request.buyerId,
    account: request.account ?? null,
    generatedAt: asOf.toISOString(),
    filters: {
      platforms: request.platforms ?? null,
      projectIds: request.projectIds ?? null,
      status: request.status ?? 'all',
      from: request.from ?? null,
      to: request.to ?? null,
      interval,
      dataSource,
    },
    totals,
    coBenefits,
    supplyChain,
    trends,
    sourceStatuses,
    invalidPositionCount,
  };
}
