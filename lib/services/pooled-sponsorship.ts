/**
 * Pooled Sponsorship Service
 *
 * In-memory store (swap for DB in production).
 * Handles pool creation, joining, proportional credit splits,
 * and revenue distribution when a pool completes.
 */

import { CO2_KG_PER_TREE } from '@/lib/stellar/tree-asset';
import type {
  PooledSponsorship,
  PoolSponsor,
  PoolCreditSplit,
  CreatePoolRequest,
  JoinPoolRequest,
} from '@/lib/types/pooled-sponsorship';

// ── In-memory store (replace with DB queries in production) ──────────────────

const pools = new Map<string, PooledSponsorship>();

function generatePoolId(): string {
  return `pool_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ── Share calculation ─────────────────────────────────────────────────────────

/**
 * Recomputes sharePercent for every sponsor based on current contributions.
 * Called after each join/contribution change.
 */
function recomputeShares(sponsors: PoolSponsor[], totalFunded: number): PoolSponsor[] {
  if (totalFunded === 0) return sponsors.map((s) => ({ ...s, sharePercent: 0 }));
  return sponsors.map((s) => ({
    ...s,
    sharePercent: parseFloat(((s.contributionUsdc / totalFunded) * 100).toFixed(4)),
  }));
}

/**
 * Distributes totalCredits proportionally across sponsors.
 * Rounding remainder is assigned to the largest contributor.
 */
export function computeCreditSplit(pool: PooledSponsorship, totalCredits: number): PoolCreditSplit {
  const splits = pool.sponsors.map((s) => ({
    sponsorAddress: s.sponsorAddress,
    sharePercent: s.sharePercent,
    creditsAllocated: 0,
    co2OffsetKg: 0,
  }));

  let assigned = 0;
  let largestIdx = 0;
  let largestShare = -1;

  for (let i = 0; i < splits.length; i++) {
    const raw = (pool.sponsors[i].sharePercent / 100) * totalCredits;
    const floored = Math.floor(raw * 1e7) / 1e7; // 7 decimal precision (Stellar)
    splits[i].creditsAllocated = floored;
    splits[i].co2OffsetKg = parseFloat((floored * CO2_KG_PER_TREE).toFixed(4));
    assigned += floored;
    if (pool.sponsors[i].sharePercent > largestShare) {
      largestShare = pool.sponsors[i].sharePercent;
      largestIdx = i;
    }
  }

  // Assign rounding remainder to largest contributor
  const remainder = parseFloat((totalCredits - assigned).toFixed(7));
  if (remainder > 0 && splits[largestIdx]) {
    splits[largestIdx].creditsAllocated = parseFloat(
      (splits[largestIdx].creditsAllocated + remainder).toFixed(7)
    );
    splits[largestIdx].co2OffsetKg = parseFloat(
      (splits[largestIdx].creditsAllocated * CO2_KG_PER_TREE).toFixed(4)
    );
  }

  return { poolId: pool.poolId, totalCredits, splits };
}

// ── CRUD operations ───────────────────────────────────────────────────────────

export function createPool(req: CreatePoolRequest): PooledSponsorship {
  const poolId = generatePoolId();
  const now = new Date().toISOString();

  const initialSponsor: PoolSponsor = {
    sponsorAddress: req.sponsorAddress,
    sponsorName: req.sponsorName,
    contributionUsdc: req.contributionUsdc,
    sharePercent: req.contributionUsdc > 0 ? 100 : 0,
    contributedAt: now,
    creditsAllocated: 0,
  };

  const totalFunded = req.contributionUsdc;
  const remaining = Math.max(0, req.targetUsdc - totalFunded);
  const fillPercent = req.targetUsdc > 0
    ? parseFloat(((totalFunded / req.targetUsdc) * 100).toFixed(2))
    : 0;

  const pool: PooledSponsorship = {
    poolId,
    treeRef: req.treeRef,
    species: req.species,
    region: req.region,
    targetUsdc: req.targetUsdc,
    totalFundedUsdc: totalFunded,
    remainingUsdc: remaining,
    fillPercent,
    status: fillPercent >= 100 ? 'funded' : 'open',
    sponsors: [initialSponsor],
    createdAt: now,
  };

  pools.set(poolId, pool);
  return pool;
}

export function joinPool(req: JoinPoolRequest): PooledSponsorship {
  const pool = pools.get(req.poolId);
  if (!pool) throw new Error(`Pool ${req.poolId} not found`);
  if (pool.status !== 'open') throw new Error(`Pool ${req.poolId} is not open for contributions`);
  if (req.contributionUsdc <= 0) throw new Error('Contribution must be greater than zero');

  // Don't exceed target
  const effectiveContribution = Math.min(req.contributionUsdc, pool.remainingUsdc);

  // Merge with existing sponsor or add new
  const existingIdx = pool.sponsors.findIndex((s) => s.sponsorAddress === req.sponsorAddress);
  if (existingIdx >= 0) {
    pool.sponsors[existingIdx].contributionUsdc += effectiveContribution;
    if (req.sponsorName) pool.sponsors[existingIdx].sponsorName = req.sponsorName;
  } else {
    pool.sponsors.push({
      sponsorAddress: req.sponsorAddress,
      sponsorName: req.sponsorName,
      contributionUsdc: effectiveContribution,
      sharePercent: 0,
      contributedAt: new Date().toISOString(),
      creditsAllocated: 0,
    });
  }

  // Recalculate totals
  const totalFunded = pool.sponsors.reduce((sum, s) => sum + s.contributionUsdc, 0);
  pool.totalFundedUsdc = parseFloat(totalFunded.toFixed(7));
  pool.remainingUsdc = parseFloat(Math.max(0, pool.targetUsdc - totalFunded).toFixed(7));
  pool.fillPercent = parseFloat(((totalFunded / pool.targetUsdc) * 100).toFixed(2));
  pool.sponsors = recomputeShares(pool.sponsors, totalFunded);

  if (pool.fillPercent >= 100) {
    pool.status = 'funded';
    pool.completedAt = new Date().toISOString();
    // Allocate 1 TREE credit per USDC contributed (matches TREES_PER_DOLLAR)
    const split = computeCreditSplit(pool, pool.targetUsdc);
    pool.sponsors = pool.sponsors.map((s, i) => ({
      ...s,
      creditsAllocated: split.splits[i]?.creditsAllocated ?? 0,
    }));
  }

  pools.set(req.poolId, pool);
  return pool;
}

export function getPool(poolId: string): PooledSponsorship | null {
  return pools.get(poolId) ?? null;
}

export function listOpenPools(): PooledSponsorship[] {
  return [...pools.values()].filter((p) => p.status === 'open');
}

export function listAllPools(): PooledSponsorship[] {
  return [...pools.values()].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}
