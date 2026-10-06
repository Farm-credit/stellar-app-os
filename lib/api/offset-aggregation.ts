/**
 * Offset aggregation API — Issue #1302 / #1426
 *
 * Aggregates a portfolio manager's carbon positions and retirements across the
 * data sources this repository already has into a single view: portfolio
 * totals, a per-platform breakdown, a per-project breakdown, and a retirement
 * ledger.
 *
 * Sources are pluggable `PortfolioSource` adapters. The default adapters read
 * only existing repo data:
 *
 *   - `stellar-credits` — CARBON credit positions in the shape used by
 *     `hooks/useCreditPortfolio.ts` / `lib/types/credits.ts`, attributed
 *     deterministically to the requested portfolio so the endpoint is
 *     hermetic. In production swap `stellarCreditSource.loadPositions` for a
 *     Horizon account-balance read (or the credit indexer); the request,
 *     response, and aggregation contract do not change.
 *   - `tree-registry` — tree-based sequestration via the existing
 *     `getSponsorImpact()` service (`lib/api/carbon-impact.ts`), one position
 *     per species.
 *
 * "Platform" here is the carbon registry / network a position lives on. The
 * values are derived from the repo's own `VerificationStatus` union
 * (`lib/types/carbon.ts`) plus the internal `tree-registry` source, so no
 * third-party integration is invented.
 *
 * The aggregation itself is a pure function over adapter output, so it is
 * unit-testable without a database or network and is safe to extend with new
 * platforms.
 */

import { z } from 'zod';
import { getSponsorImpact } from '@/lib/api/carbon-impact';
import { mockCarbonProjects } from '@/lib/api/mock/carbonProjects';

// ── Platforms & statuses ──────────────────────────────────────────────────────

/**
 * Carbon registries backed by `VerificationStatus` in `lib/types/carbon.ts`,
 * plus the two position providers this API can read today:
 * `stellar` (on-chain credit balances) and `tree-registry` (sequestration).
 * `unverified` covers projects whose registry standard is still pending.
 */
export const OFFSET_PLATFORMS = [
  'stellar',
  'tree-registry',
  'verra',
  'gold-standard',
  'climate-action-reserve',
  'plan-vivo',
  'unverified',
] as const;

export type OffsetPlatform = (typeof OFFSET_PLATFORMS)[number];

export type OffsetAssetType = 'credit' | 'sequestration';

export type OffsetPositionStatus = 'active' | 'retired';

export type OffsetStatusFilter = 'all' | OffsetPositionStatus;

/**
 * Maps the repo's project verification status onto an aggregation platform.
 * Anything unknown/pending is surfaced as `unverified` rather than dropped so
 * totals always reconcile against the input positions.
 */
export function normalizeOffsetPlatform(status: string | null | undefined): OffsetPlatform {
  switch ((status ?? '').trim().toLowerCase()) {
    case 'verra':
    case 'verra (vcs)':
      return 'verra';
    case 'gold standard':
      return 'gold-standard';
    case 'climate action reserve':
      return 'climate-action-reserve';
    case 'plan vivo':
      return 'plan-vivo';
    default:
      return 'unverified';
  }
}

// ── Request shape & validation ────────────────────────────────────────────────

/**
 * Stellar Ed25519 public keys always start with 'G' and are 56 characters
 * (base32 charset), matching `lib/schemas/planter-registration.ts`.
 */
const STELLAR_PUBLIC_KEY_REGEX = /^G[A-Z2-7]{55}$/;

export const DEFAULT_POSITION_LIMIT = 100;
export const MAX_POSITION_LIMIT = 500;

const isoDateSchema = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), 'must be an ISO 8601 date string');

export const offsetAggregationRequestSchema = z.object({
  /** Portfolio-manager identity/scope. Opaque id — never an on-chain secret. */
  portfolioId: z.string().min(1, 'portfolioId is required').max(128),
  /** Optional Stellar account whose balances back the portfolio. */
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
  /** Max number of positions returned in the `positions` list. */
  limit: z.number().int().min(1).max(MAX_POSITION_LIMIT).optional(),
});

export type OffsetAggregationRequest = z.infer<typeof offsetAggregationRequestSchema>;

export type OffsetAggregationParseResult =
  | { ok: true; data: OffsetAggregationRequest }
  | { ok: false; errors: string[] };

/**
 * Validates an already-parsed request object (POST bodies, internal callers).
 * Returns a flat list of field errors for the API's 400 response body.
 */
export function parseOffsetAggregationRequest(input: unknown): OffsetAggregationParseResult {
  const result = offsetAggregationRequestSchema.safeParse(input);

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
 * Accepts `portfolioId` (or the shorter `portfolio` alias).
 */
export function parseOffsetAggregationQuery(
  searchParams: URLSearchParams
): OffsetAggregationParseResult {
  const raw: Record<string, unknown> = {
    portfolioId: searchParams.get('portfolioId') ?? searchParams.get('portfolio') ?? undefined,
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

  const limit = searchParams.get('limit');
  if (limit !== null && limit !== '') raw.limit = Number(limit);

  return parseOffsetAggregationRequest(raw);
}

// ── Source contracts ──────────────────────────────────────────────────────────

/** One carbon position as emitted by a source adapter. */
export interface SourcePosition {
  positionId: string;
  sourceId: string;
  platform: OffsetPlatform;
  assetType: OffsetAssetType;
  projectId: string;
  projectName: string;
  /** Position size in metric tonnes of CO2e (credits held or CO2 sequestered). */
  quantityTonnes: number;
  status: OffsetPositionStatus;
  vintage?: number;
  pricePerTon?: number;
  valueUsd?: number;
  /** ISO 8601 timestamp used for the `from`/`to` range filter. */
  recordedAt: string;
  /** Present for retired positions. */
  retirement?: {
    retirementId: string;
    retiredAt: string;
    beneficiary?: string;
    transactionHash?: string;
  };
  /**
   * Currency of `pricePerTon` / `valueUsd`. Defaults to `USD` when omitted so
   * sources that predate multi-currency ledgers keep reporting USD totals.
   * Aggregations must not fold non-USD spend into a `*Usd` field — they would
   * be reporting two currencies under one label.
   */
  currency?: string;
  /**
   * Tonnes of this position that have been retired. Defaults to
   * `quantityTonnes` when `status` is `retired` and to `0` otherwise. Sources
   * backed by a real purchase ledger set this so a lot that was only partly
   * retired is reported correctly.
   */
  retiredTonnes?: number;
  /** Project type captured when the position was recorded. */
  projectType?: string;
  /** Project location captured when the position was recorded. */
  location?: string;
  /** Co-benefits captured when the position was recorded. */
  coBenefits?: string[];
}

export interface PortfolioSourceContext {
  request: OffsetAggregationRequest;
  asOf: Date;
}

/**
 * A data source the aggregation API can read. Adding a platform means adding
 * an adapter here — the aggregation and response shape stay the same.
 */
export interface PortfolioSource {
  id: string;
  label: string;
  loadPositions(context: PortfolioSourceContext): Promise<SourcePosition[]>;
}

// ── Response shapes ───────────────────────────────────────────────────────────

export interface OffsetTotals {
  positionCount: number;
  projectCount: number;
  platformCount: number;
  totalTonnes: number;
  activeTonnes: number;
  retiredTonnes: number;
  totalValueUsd: number;
  retirementCount: number;
}

export interface OffsetPlatformBreakdown {
  platform: OffsetPlatform;
  positionCount: number;
  projectCount: number;
  totalTonnes: number;
  activeTonnes: number;
  retiredTonnes: number;
  totalValueUsd: number;
}

export interface OffsetProjectBreakdown {
  projectId: string;
  projectName: string;
  platform: OffsetPlatform;
  assetType: OffsetAssetType;
  positionCount: number;
  totalTonnes: number;
  activeTonnes: number;
  retiredTonnes: number;
  totalValueUsd: number;
  vintages: number[];
}

export interface AggregatedRetirement {
  retirementId: string;
  platform: OffsetPlatform;
  projectId: string;
  projectName: string;
  quantityTonnes: number;
  retiredAt: string;
  beneficiary?: string;
  transactionHash?: string;
}

export interface OffsetSourceStatus {
  sourceId: string;
  label: string;
  status: 'ok' | 'error';
  positionCount: number;
  error?: string;
}

export interface PortfolioOffsetSummary {
  portfolioId: string;
  account: string | null;
  generatedAt: string;
  filters: {
    platforms: OffsetPlatform[] | null;
    projectIds: string[] | null;
    status: OffsetStatusFilter;
    from: string | null;
    to: string | null;
    limit: number;
  };
  totals: OffsetTotals;
  /** Positions dropped because they were malformed (counted for observability). */
  invalidPositionCount: number;
  byPlatform: OffsetPlatformBreakdown[];
  byProject: OffsetProjectBreakdown[];
  positions: SourcePosition[];
  retirements: AggregatedRetirement[];
  sources: OffsetSourceStatus[];
}

/** Thrown only when every source fails, so partial results are still returned. */
export class OffsetAggregationError extends Error {
  readonly failures: { sourceId: string; message: string }[];

  constructor(message: string, failures: { sourceId: string; message: string }[]) {
    super(message);
    this.name = 'OffsetAggregationError';
    this.failures = failures;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const HEX_DIGITS = '0123456789abcdef';
const MS_PER_DAY = 86_400_000;

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function deterministicHashHex(seed: number): string {
  let state = seed >>> 0 || 1;
  let hex = '';
  for (let i = 0; i < 64; i += 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    hex += HEX_DIGITS[state % 16];
  }
  return hex;
}

function daysBefore(base: Date, days: number): string {
  return new Date(base.getTime() - days * MS_PER_DAY).toISOString();
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function roundTonnes(value: number): number {
  return parseFloat(value.toFixed(4));
}

function roundUsd(value: number): number {
  return parseFloat(value.toFixed(2));
}

// ── Default sources ───────────────────────────────────────────────────────────

const CREDIT_SOURCE_ID = 'stellar-credits';
const TREE_SOURCE_ID = 'tree-registry';
const TREE_PROJECT_PREFIX = 'tree-';

/**
 * Deterministic, portfolio-scoped credit positions over the repo's existing
 * carbon project catalogue. The membership/amount/retirement selection is
 * derived from the portfolio id so repeated calls are stable — the same
 * property `lib/api/carbon-impact.ts` relies on for its contract mock.
 *
 * PRODUCTION SEAM: replace the body of `loadPositions` with a Horizon
 * account-balance read (mirroring `hooks/useCreditPortfolio.ts`, which parses
 * CARBON* assets into `CreditHolding`) or the credit indexer. Only this
 * function changes.
 */
export const stellarCreditSource: PortfolioSource = {
  id: CREDIT_SOURCE_ID,
  label: 'Stellar carbon credit positions',
  async loadPositions({ request, asOf }: PortfolioSourceContext): Promise<SourcePosition[]> {
    const portfolioSeed = stableHash(request.portfolioId);
    const positions: SourcePosition[] = [];

    mockCarbonProjects.forEach((project, index) => {
      // Deterministic portfolio membership: ~1/3 of the catalogue is skipped
      // per portfolio, matching the attribution pattern in carbon-impact.ts.
      if ((index + portfolioSeed) % 3 === 0) return;

      const seed = stableHash(`${request.portfolioId}:${project.id}`);
      const quantityTonnes = roundTonnes(50 + (seed % 950) + (seed % 100) / 100);
      const retired = (index + portfolioSeed) % 5 === 0;
      const recordedAt = daysBefore(asOf, retired ? (seed % 300) + 1 : (seed % 700) + 30);

      positions.push({
        positionId: `${project.id}-${project.vintageYear}${retired ? '-retired' : ''}`,
        sourceId: CREDIT_SOURCE_ID,
        platform: normalizeOffsetPlatform(project.verificationStatus),
        assetType: 'credit',
        projectId: project.id,
        projectName: project.name,
        quantityTonnes,
        status: retired ? 'retired' : 'active',
        vintage: project.vintageYear,
        pricePerTon: project.pricePerTon,
        valueUsd: roundUsd(quantityTonnes * project.pricePerTon),
        recordedAt,
        retirement: retired
          ? {
              retirementId: `ret-${project.id}-${project.vintageYear}`,
              retiredAt: recordedAt,
              beneficiary: request.account ?? request.portfolioId,
              transactionHash: deterministicHashHex(seed),
            }
          : undefined,
      });
    });

    return positions;
  },
};

/**
 * Tree-based sequestration sourced from the existing per-sponsor impact
 * aggregation (`getSponsorImpact`). One position per species keeps the
 * per-project breakdown useful without inventing a tree→project mapping the
 * data model does not have.
 */
export const treeSequestrationSource: PortfolioSource = {
  id: TREE_SOURCE_ID,
  label: 'Tree registry sequestration',
  async loadPositions({ request, asOf }: PortfolioSourceContext): Promise<SourcePosition[]> {
    const impact = await getSponsorImpact(request.account ?? request.portfolioId);

    return impact.bySpecies
      .filter((entry) => entry.co2OffsetTonnes > 0)
      .map((entry) => {
        const slug = slugify(entry.species);
        return {
          positionId: `${TREE_PROJECT_PREFIX}${slug}`,
          sourceId: TREE_SOURCE_ID,
          platform: 'tree-registry',
          assetType: 'sequestration',
          projectId: `${TREE_PROJECT_PREFIX}${slug}`,
          projectName: `${entry.species} tree sequestration`,
          quantityTonnes: roundTonnes(entry.co2OffsetTonnes),
          status: 'active',
          recordedAt: asOf.toISOString(),
        } satisfies SourcePosition;
      });
  },
};

export const DEFAULT_PORTFOLIO_SOURCES: PortfolioSource[] = [
  stellarCreditSource,
  treeSequestrationSource,
];

// ── Filtering & aggregation ───────────────────────────────────────────────────

function isValidPosition(position: SourcePosition): boolean {
  return (
    typeof position.positionId === 'string' &&
    position.positionId.length > 0 &&
    typeof position.projectId === 'string' &&
    position.projectId.length > 0 &&
    typeof position.quantityTonnes === 'number' &&
    Number.isFinite(position.quantityTonnes) &&
    position.quantityTonnes >= 0
  );
}

function matchesFilters(position: SourcePosition, request: OffsetAggregationRequest): boolean {
  if (request.platforms?.length && !request.platforms.includes(position.platform)) return false;
  if (request.projectIds?.length && !request.projectIds.includes(position.projectId)) return false;

  const status = request.status ?? 'all';
  if (status !== 'all' && position.status !== status) return false;

  const recordedAt = Date.parse(position.recordedAt);
  if (request.from && recordedAt < Date.parse(request.from)) return false;
  if (request.to && recordedAt > Date.parse(request.to)) return false;

  return true;
}

function buildPlatformBreakdown(positions: SourcePosition[]): OffsetPlatformBreakdown[] {
  const buckets = new Map<OffsetPlatform, OffsetPlatformBreakdown>();
  const projectsByPlatform = new Map<OffsetPlatform, Set<string>>();

  for (const position of positions) {
    const bucket = buckets.get(position.platform) ?? {
      platform: position.platform,
      positionCount: 0,
      projectCount: 0,
      totalTonnes: 0,
      activeTonnes: 0,
      retiredTonnes: 0,
      totalValueUsd: 0,
    };

    bucket.positionCount += 1;
    bucket.totalTonnes += position.quantityTonnes;
    if (position.status === 'retired') {
      bucket.retiredTonnes += position.quantityTonnes;
    } else {
      bucket.activeTonnes += position.quantityTonnes;
    }
    bucket.totalValueUsd += position.valueUsd ?? 0;
    buckets.set(position.platform, bucket);

    const projectSet = projectsByPlatform.get(position.platform) ?? new Set<string>();
    projectSet.add(position.projectId);
    projectsByPlatform.set(position.platform, projectSet);
  }

  return [...buckets.values()]
    .map((bucket) => ({
      ...bucket,
      projectCount: projectsByPlatform.get(bucket.platform)?.size ?? 0,
      totalTonnes: roundTonnes(bucket.totalTonnes),
      activeTonnes: roundTonnes(bucket.activeTonnes),
      retiredTonnes: roundTonnes(bucket.retiredTonnes),
      totalValueUsd: roundUsd(bucket.totalValueUsd),
    }))
    .sort((a, b) => b.totalTonnes - a.totalTonnes || a.platform.localeCompare(b.platform));
}

function buildProjectBreakdown(positions: SourcePosition[]): OffsetProjectBreakdown[] {
  const buckets = new Map<string, OffsetProjectBreakdown>();
  const vintagesByProject = new Map<string, Set<number>>();

  for (const position of positions) {
    const bucket = buckets.get(position.projectId) ?? {
      projectId: position.projectId,
      projectName: position.projectName,
      platform: position.platform,
      assetType: position.assetType,
      positionCount: 0,
      totalTonnes: 0,
      activeTonnes: 0,
      retiredTonnes: 0,
      totalValueUsd: 0,
      vintages: [],
    };

    bucket.positionCount += 1;
    bucket.totalTonnes += position.quantityTonnes;
    if (position.status === 'retired') {
      bucket.retiredTonnes += position.quantityTonnes;
    } else {
      bucket.activeTonnes += position.quantityTonnes;
    }
    bucket.totalValueUsd += position.valueUsd ?? 0;
    buckets.set(position.projectId, bucket);

    if (typeof position.vintage === 'number') {
      const vintages = vintagesByProject.get(position.projectId) ?? new Set<number>();
      vintages.add(position.vintage);
      vintagesByProject.set(position.projectId, vintages);
    }
  }

  return [...buckets.values()]
    .map((bucket) => ({
      ...bucket,
      vintages: [...(vintagesByProject.get(bucket.projectId) ?? [])].sort((a, b) => a - b),
      totalTonnes: roundTonnes(bucket.totalTonnes),
      activeTonnes: roundTonnes(bucket.activeTonnes),
      retiredTonnes: roundTonnes(bucket.retiredTonnes),
      totalValueUsd: roundUsd(bucket.totalValueUsd),
    }))
    .sort((a, b) => b.totalTonnes - a.totalTonnes || a.projectId.localeCompare(b.projectId));
}

function buildRetirements(positions: SourcePosition[]): AggregatedRetirement[] {
  const retirements: AggregatedRetirement[] = [];

  for (const position of positions) {
    if (position.status !== 'retired') continue;

    retirements.push({
      retirementId: position.retirement?.retirementId ?? `${position.positionId}-retirement`,
      platform: position.platform,
      projectId: position.projectId,
      projectName: position.projectName,
      quantityTonnes: roundTonnes(position.quantityTonnes),
      retiredAt: position.retirement?.retiredAt ?? position.recordedAt,
      ...(position.retirement?.beneficiary
        ? { beneficiary: position.retirement.beneficiary }
        : {}),
      ...(position.retirement?.transactionHash
        ? { transactionHash: position.retirement.transactionHash }
        : {}),
    });
  }

  return retirements.sort((a, b) => b.retiredAt.localeCompare(a.retiredAt));
}

function buildTotals(
  positions: SourcePosition[],
  retirements: AggregatedRetirement[],
  platformCount: number,
  projectCount: number
): OffsetTotals {
  let totalTonnes = 0;
  let activeTonnes = 0;
  let retiredTonnes = 0;
  let totalValueUsd = 0;

  for (const position of positions) {
    totalTonnes += position.quantityTonnes;
    if (position.status === 'retired') {
      retiredTonnes += position.quantityTonnes;
    } else {
      activeTonnes += position.quantityTonnes;
    }
    totalValueUsd += position.valueUsd ?? 0;
  }

  return {
    positionCount: positions.length,
    projectCount,
    platformCount,
    totalTonnes: roundTonnes(totalTonnes),
    activeTonnes: roundTonnes(activeTonnes),
    retiredTonnes: roundTonnes(retiredTonnes),
    totalValueUsd: roundUsd(totalValueUsd),
    retirementCount: retirements.length,
  };
}

function toAggregatedPosition(position: SourcePosition): SourcePosition {
  return {
    ...position,
    quantityTonnes: roundTonnes(position.quantityTonnes),
    ...(position.valueUsd === undefined ? {} : { valueUsd: roundUsd(position.valueUsd) }),
  };
}

export interface AggregateOffsetOptions {
  /** Override the source adapters (tests, or a caller with live adapters). */
  sources?: PortfolioSource[];
  /** Injectable clock so responses are deterministic in tests. */
  now?: Date;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Loads every source, aggregates their positions and retirements, and returns
 * a single portfolio view.
 *
 * A failing source is reported in `sources` with `status: 'error'` while the
 * remaining sources still contribute (partial-failure tolerance). If *every*
 * source fails, `OffsetAggregationError` is thrown so the route can return a
 * gateway error instead of a misleading empty portfolio.
 */
export async function aggregatePortfolioOffsets(
  request: OffsetAggregationRequest,
  options: AggregateOffsetOptions = {}
): Promise<PortfolioOffsetSummary> {
  const sources = options.sources ?? DEFAULT_PORTFOLIO_SOURCES;
  const asOf = options.now ?? new Date();

  const results = await Promise.all(
    sources.map(async (source) => {
      try {
        const positions = await source.loadPositions({ request, asOf });
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
    throw new OffsetAggregationError(
      'All portfolio sources failed',
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
  const filtered = validPositions.filter((position) => matchesFilters(position, request));

  const byPlatform = buildPlatformBreakdown(filtered);
  const byProject = buildProjectBreakdown(filtered);
  const retirements = buildRetirements(filtered);
  const totals = buildTotals(filtered, retirements, byPlatform.length, byProject.length);

  const limit = request.limit ?? DEFAULT_POSITION_LIMIT;
  const positions = [...filtered]
    .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))
    .slice(0, limit)
    .map(toAggregatedPosition);

  return {
    portfolioId: request.portfolioId,
    account: request.account ?? null,
    generatedAt: asOf.toISOString(),
    filters: {
      platforms: request.platforms ?? null,
      projectIds: request.projectIds ?? null,
      status: request.status ?? 'all',
      from: request.from ?? null,
      to: request.to ?? null,
      limit,
    },
    totals,
    invalidPositionCount,
    byPlatform,
    byProject,
    positions,
    retirements,
    sources: sourceStatuses,
  };
}
