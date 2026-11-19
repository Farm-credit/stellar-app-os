/**
 * Buyer offset ledger source — Issue #1289
 *
 * A real, PostgreSQL-backed `PortfolioSource` for the buyer analytics
 * dashboard (`lib/api/buyer-analytics.ts`), which until now could only be fed
 * deterministic synthetic positions.
 *
 * It reads the two tables this repo already persists:
 *
 *   - `corporate_offset_purchases` (joined to `corporate_offset_programs`) —
 *     the actual purchase ledger written by `lib/corporate-offset.ts`. One
 *     `SourcePosition` per purchase lot, carrying the real quantity, unit
 *     price, total price, and currency.
 *   - `retirement_receipts` — the immutable retirement proofs written by
 *     `POST /api/credits/retire`. These carry an immutable project snapshot
 *     (name, type, location, vintage, co-benefits) plus the tonnes retired and
 *     the Stellar tx hash.
 *
 * Tonnes must not be double counted. A purchase lot and a retirement are two
 * records of the *same* tonnes, so retirements are allocated onto lots
 * first-in-first-out per project (oldest lots retire first, which is how
 * vintages are actually surrendered). A lot that was only partly retired stays
 * `active` and reports its real `retiredTonnes`, so a partial retirement is
 * visible instead of being rounded to a whole lot.
 *
 * Retirement receipts with no matching purchase (credits acquired outside this
 * ledger) are never turned into positions — doing so would inflate the buyer's
 * purchased tonnage. The surplus is reported through `loadBuyerLedger` so
 * callers can surface the discrepancy instead of silently dropping it.
 *
 * The purchase and allocation helpers are exported as pure functions so they
 * are unit-testable without a database.
 */

import {
  normalizeOffsetPlatform,
  type OffsetPlatform,
  type PortfolioSource,
  type PortfolioSourceContext,
  type SourcePosition,
} from '@/lib/api/offset-aggregation';
import { mockCarbonProjects } from '@/lib/api/mock/carbonProjects';
import { getPool } from '@/lib/db/client';
import logger from '@/lib/logger';
import type { CarbonProject } from '@/lib/types/carbon';

// ── Constants ─────────────────────────────────────────────────────────────────

export const LEDGER_SOURCE_ID = 'buyer-ledger';
export const LEDGER_SOURCE_LABEL = 'Corporate offset ledger';

/** Stellar Ed25519 public key — matches `lib/api/offset-aggregation.ts`. */
const STELLAR_PUBLIC_KEY_REGEX = /^G[A-Z2-7]{55}$/;

/** `corporate_offset_programs.id` is a UUID primary key. */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Floating-point slack when deciding whether a lot is fully retired. */
const TONNES_EPSILON = 1e-9;

// ── Row shapes ────────────────────────────────────────────────────────────────

export interface LedgerPurchaseRow {
  id: string;
  project_id: string;
  quantity_tco2e: string | number;
  unit_price: string | number;
  total_price: string | number;
  currency: string | null;
  purchase_date: string | Date;
  tx_hash: string | null;
}

export interface LedgerRetirementRow {
  retirement_key: string;
  project_id: string;
  project_name: string;
  project_location: string | null;
  project_type: string | null;
  vintage_year: number | null;
  co_benefits: unknown;
  credit_amount: string | number;
  tx_hash: string | null;
  created_at: string | Date;
  buyer_email: string | null;
}

// ── Normalized records ────────────────────────────────────────────────────────

export interface LedgerPurchase {
  positionId: string;
  projectId: string;
  quantityTonnes: number;
  unitPrice: number;
  totalPrice: number;
  currency: string;
  purchasedAt: string;
  transactionHash: string | null;
}

export interface LedgerRetirement {
  retirementId: string;
  projectId: string;
  projectName: string;
  projectLocation: string | null;
  projectType: string | null;
  vintageYear: number | null;
  coBenefits: string[];
  tonnes: number;
  retiredAt: string;
  transactionHash: string | null;
  beneficiary: string | null;
}

/** Project metadata resolved from retirement receipts, with a catalogue fallback. */
export interface ProjectMetadata {
  name: string;
  type: string | null;
  location: string | null;
  vintageYear: number | null;
  coBenefits: string[];
  platform: OffsetPlatform;
}

// ── Mapping helpers ───────────────────────────────────────────────────────────

function toNumber(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toIsoString(value: string | Date): string {
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date(0).toISOString() : parsed.toISOString();
}

function toOptionalNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** `co_benefits` is a JSONB array of strings; tolerate anything else gracefully. */
export function parseCoBenefits(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
}

export function mapPurchaseRow(row: LedgerPurchaseRow): LedgerPurchase {
  return {
    positionId: `purchase:${row.id}`,
    projectId: row.project_id,
    quantityTonnes: toNumber(row.quantity_tco2e),
    unitPrice: toNumber(row.unit_price),
    totalPrice: toNumber(row.total_price),
    // Schema default is 'USDC'; never silently relabel it as USD.
    currency: (row.currency ?? 'USDC').toUpperCase(),
    purchasedAt: toIsoString(row.purchase_date),
    transactionHash: row.tx_hash ?? null,
  };
}

export function mapRetirementRow(row: LedgerRetirementRow): LedgerRetirement {
  return {
    retirementId: row.retirement_key,
    projectId: row.project_id,
    projectName: row.project_name,
    projectLocation: row.project_location ?? null,
    projectType: row.project_type ?? null,
    vintageYear: toOptionalNumber(row.vintage_year),
    coBenefits: parseCoBenefits(row.co_benefits),
    tonnes: toNumber(row.credit_amount),
    retiredAt: toIsoString(row.created_at),
    transactionHash: row.tx_hash ?? null,
    beneficiary: row.buyer_email ?? null,
  };
}

const CATALOGUE_BY_ID = new Map<string, CarbonProject>(
  mockCarbonProjects.map((project) => [project.id, project])
);

/**
 * Resolves display metadata for every project the buyer has ever touched.
 *
 * Retirement receipts copy the project details at retirement time so later
 * project edits cannot rewrite history, so they win over the catalogue; the
 * most recent receipt is used because it reflects the project as it stood at
 * the last surrender. The catalogue is consulted for projects that were never
 * retired, and for metadata the receipts do not carry — most importantly the
 * registry platform, which receipts do not record.
 *
 * Co-benefits are unioned across every receipt, so a benefit claimed against
 * the project at any retirement is still reported, falling back to the
 * catalogue when no receipt recorded one.
 */
export function buildProjectMetadata(
  retirements: LedgerRetirement[],
  purchasedProjectIds: string[] = []
): Map<string, ProjectMetadata> {
  const retirementsByProject = new Map<string, LedgerRetirement[]>();
  for (const retirement of retirements) {
    const list = retirementsByProject.get(retirement.projectId) ?? [];
    list.push(retirement);
    retirementsByProject.set(retirement.projectId, list);
  }

  const projectIds = new Set<string>([...purchasedProjectIds, ...retirementsByProject.keys()]);
  const metadata = new Map<string, ProjectMetadata>();

  for (const projectId of projectIds) {
    const catalogue = CATALOGUE_BY_ID.get(projectId);
    const receipts = (retirementsByProject.get(projectId) ?? []).slice().sort(
      (a, b) => a.retiredAt.localeCompare(b.retiredAt) || a.retirementId.localeCompare(b.retirementId)
    );
    const latest = receipts[receipts.length - 1];

    const coBenefits: string[] = [];
    for (const receipt of receipts) {
      for (const benefit of receipt.coBenefits) {
        if (!coBenefits.includes(benefit)) coBenefits.push(benefit);
      }
    }

    metadata.set(projectId, {
      name: latest?.projectName || catalogue?.name || projectId,
      type: latest?.projectType ?? catalogue?.type ?? null,
      location: latest?.projectLocation ?? catalogue?.location ?? null,
      vintageYear: latest?.vintageYear ?? catalogue?.vintageYear ?? null,
      coBenefits: coBenefits.length > 0 ? coBenefits : [...(catalogue?.coBenefits ?? [])],
      platform: normalizeOffsetPlatform(catalogue?.verificationStatus),
    });
  }

  return metadata;
}

// ── FIFO retirement allocation ────────────────────────────────────────────────

export interface RetirementAllocation {
  /** Tonnes of this lot already retired. */
  retiredTonnes: number;
  /** Latest retirement that touched this lot; absent while nothing is retired. */
  retirement?: SourcePosition['retirement'];
}

export interface RetirementAllocationResult {
  byPositionId: Map<string, RetirementAllocation>;
  /**
   * Tonnes retired for this buyer that exceed the recorded purchase lots for
   * the same project — credits acquired outside this ledger. Excluded from
   * positions on purpose so purchased tonnage is not inflated.
   */
  unallocatedTonnes: number;
}

/**
 * Allocates retirements onto purchase lots first-in-first-out per project.
 *
 * A lot is matched only to retirements of the same project, oldest first, and
 * a lot can be partly consumed by a receipt that spills onto the next lot.
 */
export function allocateRetirements(
  purchases: LedgerPurchase[],
  retirements: LedgerRetirement[]
): RetirementAllocationResult {
  const lotsByProject = new Map<string, LedgerPurchase[]>();
  for (const purchase of purchases) {
    const lots = lotsByProject.get(purchase.projectId) ?? [];
    lots.push(purchase);
    lotsByProject.set(purchase.projectId, lots);
  }
  for (const lots of lotsByProject.values()) {
    lots.sort((a, b) => a.purchasedAt.localeCompare(b.purchasedAt) || a.positionId.localeCompare(b.positionId));
  }

  const retirementsByProject = new Map<string, LedgerRetirement[]>();
  for (const retirement of retirements) {
    if (retirement.tonnes <= 0) continue;
    const list = retirementsByProject.get(retirement.projectId) ?? [];
    list.push(retirement);
    retirementsByProject.set(retirement.projectId, list);
  }
  for (const list of retirementsByProject.values()) {
    list.sort((a, b) => a.retiredAt.localeCompare(b.retiredAt) || a.retirementId.localeCompare(b.retirementId));
  }

  const byPositionId = new Map<string, RetirementAllocation>();
  let unallocatedTonnes = 0;

  for (const [projectId, retirementsForProject] of retirementsByProject) {
    const lots = lotsByProject.get(projectId) ?? [];
    let remainingPurchased = lots.reduce((sum, lot) => sum + lot.quantityTonnes, 0);

    for (const retirement of retirementsForProject) {
      if (remainingPurchased <= TONNES_EPSILON) {
        unallocatedTonnes += retirement.tonnes;
        continue;
      }

      let outstanding = retirement.tonnes;
      for (const lot of lots) {
        if (outstanding <= TONNES_EPSILON || remainingPurchased <= TONNES_EPSILON) break;

        const allocation = byPositionId.get(lot.positionId) ?? { retiredTonnes: 0 };
        const alreadyRetired = allocation.retiredTonnes;
        const lotOutstanding = lot.quantityTonnes - alreadyRetired;
        if (lotOutstanding <= TONNES_EPSILON) continue;

        const applied = Math.min(lotOutstanding, outstanding);
        allocation.retiredTonnes = alreadyRetired + applied;

        // Keep the most recent contributing receipt as the position's
        // retirement proof; `retiredAt` is what the supply chain shows.
        const existing = allocation.retirement;
        if (
          !existing ||
          Date.parse(retirement.retiredAt) >= Date.parse(existing.retiredAt) ||
          existing.retirementId === retirement.retirementId
        ) {
          allocation.retirement = {
            retirementId: retirement.retirementId,
            retiredAt: retirement.retiredAt,
            ...(retirement.beneficiary ? { beneficiary: retirement.beneficiary } : {}),
            ...(retirement.transactionHash ? { transactionHash: retirement.transactionHash } : {}),
          };
        }

        byPositionId.set(lot.positionId, allocation);
        outstanding -= applied;
        remainingPurchased -= applied;
      }

      if (outstanding > TONNES_EPSILON) unallocatedTonnes += outstanding;
    }
  }

  return { byPositionId, unallocatedTonnes };
}

// ── Position mapping ──────────────────────────────────────────────────────────

export function mapPurchaseToPosition(
  purchase: LedgerPurchase,
  allocation: RetirementAllocation | undefined,
  metadata: Map<string, ProjectMetadata>
): SourcePosition {
  const retiredTonnes = Math.min(allocation?.retiredTonnes ?? 0, purchase.quantityTonnes);
  const fullyRetired = retiredTonnes >= purchase.quantityTonnes - TONNES_EPSILON;
  const project = metadata.get(purchase.projectId);

  return {
    positionId: purchase.positionId,
    sourceId: LEDGER_SOURCE_ID,
    platform: project?.platform ?? 'unverified',
    assetType: 'credit',
    projectId: purchase.projectId,
    projectName: project?.name ?? purchase.projectId,
    quantityTonnes: purchase.quantityTonnes,
    status: fullyRetired ? 'retired' : 'active',
    ...(project?.vintageYear != null ? { vintage: project.vintageYear } : {}),
    pricePerTon: purchase.unitPrice,
    valueUsd: purchase.totalPrice,
    recordedAt: purchase.purchasedAt,
    currency: purchase.currency,
    retiredTonnes,
    ...(project?.type ? { projectType: project.type } : {}),
    ...(project?.location ? { location: project.location } : {}),
    ...(project?.coBenefits.length ? { coBenefits: [...project.coBenefits] } : {}),
    ...(retiredTonnes > 0 && allocation?.retirement ? { retirement: allocation.retirement } : {}),
  };
}

// ── Queries ───────────────────────────────────────────────────────────────────

/**
 * Resolves the buyer's Stellar wallet.
 *
 * `account` wins; otherwise a Stellar-format `portfolioId` is the wallet, and a
 * UUID `portfolioId` is looked up as a corporate program id. Anything else
 * cannot be tied to a ledger row, so it yields `null`.
 */
export async function resolveBuyerWallet(portfolioId: string, account?: string): Promise<string | null> {
  if (account) return account;
  if (STELLAR_PUBLIC_KEY_REGEX.test(portfolioId)) return portfolioId;
  if (!UUID_REGEX.test(portfolioId)) return null;

  const pool = getPool();
  const result = await pool.query<{ wallet_address: string }>(
    'SELECT wallet_address FROM corporate_offset_programs WHERE id = $1',
    [portfolioId]
  );
  const wallet = result.rows[0]?.wallet_address;
  return wallet ? String(wallet) : null;
}

/**
 * Every purchase up to the reporting window is read, with *no* lower bound.
 *
 * Retirements are allocated FIFO, so a lot inside the window can have been
 * partly consumed by receipts against older lots. Truncating the purchase
 * history first would make those older receipts look unallocated and would
 * under-report the in-window lot. The `from` bound is therefore applied after
 * allocation, in `loadBuyerLedger`.
 */
async function loadPurchases(wallet: string, to?: string): Promise<LedgerPurchase[]> {
  const pool = getPool();
  const result = await pool.query<LedgerPurchaseRow>(
    `SELECT p.id, p.project_id, p.quantity_tco2e, p.unit_price, p.total_price,
            p.currency, p.purchase_date, p.tx_hash
     FROM corporate_offset_purchases p
     JOIN corporate_offset_programs g ON g.id = p.program_id
     WHERE g.wallet_address = $1
       AND ($2::timestamptz IS NULL OR p.purchase_date <= $2)
     ORDER BY p.purchase_date ASC`,
    [wallet, to ?? null]
  );
  return result.rows.map(mapPurchaseRow);
}

/**
 * Retirement receipts are read with an `asOf` upper bound but *no* lower bound:
 * a lot purchased inside the reporting window may have been retired against
 * receipts written earlier, and cutting those off would under-report its
 * retired tonnage.
 */
async function loadRetirements(wallet: string, asOf?: string): Promise<LedgerRetirement[]> {
  const pool = getPool();
  const result = await pool.query<LedgerRetirementRow>(
    `SELECT retirement_key, project_id, project_name, project_location, project_type,
            vintage_year, co_benefits, credit_amount, tx_hash, created_at, buyer_email
     FROM retirement_receipts
     WHERE buyer_wallet = $1
       AND ($2::timestamptz IS NULL OR created_at <= $2)
     ORDER BY created_at ASC`,
    [wallet, asOf ?? null]
  );
  return result.rows.map(mapRetirementRow);
}

// ── Loader ────────────────────────────────────────────────────────────────────

export interface LoadedBuyerLedger {
  wallet: string;
  positions: SourcePosition[];
  /** Retired tonnes with no matching purchase lot; excluded from `positions`. */
  unallocatedRetiredTonnes: number;
}

export interface LoadBuyerLedgerOptions {
  portfolioId: string;
  account?: string;
  from?: string;
  to?: string;
  asOf?: Date;
}

/**
 * Loads the buyer's real ledger: purchase lots as positions, with retirements
 * allocated FIFO. Returns the retirement surplus separately rather than
 * inflating the positions with tonnes that were never recorded as purchased.
 */
export async function loadBuyerLedger(options: LoadBuyerLedgerOptions): Promise<LoadedBuyerLedger> {
  const wallet = await resolveBuyerWallet(options.portfolioId, options.account);
  if (!wallet) return { wallet: '', positions: [], unallocatedRetiredTonnes: 0 };

  const [allPurchases, retirements] = await Promise.all([
    loadPurchases(wallet, options.to),
    loadRetirements(wallet, options.asOf?.toISOString()),
  ]);

  const { byPositionId, unallocatedTonnes } = allocateRetirements(allPurchases, retirements);

  // Truncate to the reporting window only after allocating, so an in-window lot
  // still reports the retirement it was matched to against an older lot.
  const fromTime = options.from ? Date.parse(options.from) : null;
  const purchases =
    fromTime === null
      ? allPurchases
      : allPurchases.filter((purchase) => Date.parse(purchase.purchasedAt) >= fromTime);

  // Purchased projects are included so a lot that has never been retired still
  // reports its catalogue name, registry platform, and co-benefits.
  const metadata = buildProjectMetadata(
    retirements,
    purchases.map((purchase) => purchase.projectId)
  );

  if (unallocatedTonnes > 0) {
    logger.warn('[buyer-offset-ledger] retirements exceed recorded purchases', {
      wallet,
      unallocatedTonnes,
    });
  }

  return {
    wallet,
    positions: purchases.map((purchase) =>
      mapPurchaseToPosition(purchase, byPositionId.get(purchase.positionId), metadata)
    ),
    unallocatedRetiredTonnes: unallocatedTonnes,
  };
}

// ── Portfolio source ──────────────────────────────────────────────────────────

/**
 * Drop-in `PortfolioSource` for `lib/api/buyer-analytics.ts`. The retirement
 * surplus is logged but not emitted, because the `PortfolioSource` contract
 * carries positions only; `loadBuyerLedger` exposes it to callers that can
 * report it.
 */
export const buyerLedgerSource: PortfolioSource = {
  id: LEDGER_SOURCE_ID,
  label: LEDGER_SOURCE_LABEL,
  async loadPositions({ request, asOf }: PortfolioSourceContext): Promise<SourcePosition[]> {
    const { positions } = await loadBuyerLedger({
      portfolioId: request.portfolioId,
      account: request.account,
      from: request.from,
      to: request.to,
      asOf,
    });
    return positions;
  },
};
