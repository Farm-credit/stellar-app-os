/**
 * Tree Registry data service — Issue #542
 *
 * Queries the Stellar Horizon API for tree-related transactions and merges
 * them with the in-memory mock contract state. Results are cached for 30 s.
 *
 * When real contract RPC is wired up, replace the mock layer below with an
 * actual soroban-client call.
 */

import { Horizon } from '@stellar/stellar-sdk';
import { networkConfig } from '@/lib/config/network';
import { getMockTrees } from '@/lib/api/mock/trees';
import { cacheGet, cacheSet } from '@/lib/api/tree-registry-cache';
import type { Tree, TreeStatus } from '@/lib/types/tree';

// ── Horizon helpers ───────────────────────────────────────────────────────────

function getHorizonServer(): Horizon.Server {
  return new Horizon.Server(networkConfig.horizonUrl, { allowHttp: true });
}

/** Map a Stellar payment memo or status string to our TreeStatus enum */
// Currently unused - keeping for future memo parsing implementation

function toTreeStatus(raw?: string): TreeStatus {
  const statuses: TreeStatus[] = ['funded', 'planted', 'verified', 'completed', 'failed'];
  const lower = (raw ?? '').toLowerCase();
  return (statuses.find((s) => lower.includes(s)) as TreeStatus) ?? 'funded';
}

/** Fetch recent TREE token operations from Horizon (best-effort, non-fatal). */
async function fetchHorizonTreeOps(): Promise<
  Map<string, { status: TreeStatus; plantedAt?: string }>
> {
  const result = new Map<string, { status: TreeStatus; plantedAt?: string }>();
  try {
    const server = getHorizonServer();
    const { TREE_ISSUER_TESTNET } = await import('@/lib/stellar/tree-asset');
    if (!TREE_ISSUER_TESTNET) return result;

    const ops = await server
      .payments()
      .forAccount(TREE_ISSUER_TESTNET)
      .limit(100)
      .order('desc')
      .call();

    for (const record of ops.records) {
      if (record.type !== 'payment') continue;
      const payment = record as Horizon.ServerApi.PaymentOperationRecord;
      if (payment.asset_code !== 'TREE') continue;

      const treeId = `HRV-HORIZON-${payment.id.slice(-6)}`;
      result.set(treeId, {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        status: toTreeStatus((payment as any).transaction_attr?.memo as string | undefined),
        plantedAt: payment.created_at,
      });
    }
  } catch {
    // Horizon unreachable on testnet — fall through gracefully
  }
  return result;
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface TreeListOptions {
  species?: string;
  region?: string;
  status?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface TreeListResult {
  trees: Tree[];
  totalCount: number;
  limit: number;
  offset: number;
  cachedAt: string;
}

/**
 * Fetch all trees, merged from mock contract state + Horizon, with 30 s cache.
 */
export async function getTreeList(opts: TreeListOptions = {}): Promise<TreeListResult> {
  const cacheKey = 'tree-registry:list';
  const cached = cacheGet<TreeListResult>(cacheKey);
  if (cached) return applyFilters(cached, opts);

  // Base data: mock contract state (replace with soroban-client call in prod)
  const trees: Tree[] = getMockTrees();

  // Best-effort overlay from Horizon
  const horizonMap = await fetchHorizonTreeOps();
  for (const [treeId, info] of horizonMap) {
    if (!trees.find((t) => t.treeId === treeId)) {
      trees.push({
        id: `horizon-${treeId}`,
        treeId,
        species: 'Teak',
        region: 'Unknown',
        status: info.status,
        plantedAt: info.plantedAt,
        lat: 0,
        lng: 0,
        co2OffsetKgPerYear: 48,
        projectName: 'Horizon-indexed',
      });
    }
  }

  const base: TreeListResult = {
    trees,
    totalCount: trees.length,
    limit: opts.limit ?? 50,
    offset: opts.offset ?? 0,
    cachedAt: new Date().toISOString(),
  };

  cacheSet(cacheKey, base);
  return applyFilters(base, opts);
}

/**
 * Fetch a single tree by its treeId. Returns null if not found.
 * Uses the same cache as getTreeList.
 */
export async function getTreeById(treeId: string): Promise<Tree | null> {
  const list = await getTreeList();
  return list.trees.find((t) => t.treeId === treeId || t.id === treeId) ?? null;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function applyFilters(base: TreeListResult, opts: TreeListOptions): TreeListResult {
  const { species, region, status, search, limit = 50, offset = 0 } = opts;
  const query = search?.trim().toLowerCase() ?? '';

  let filtered = base.trees.filter((t) => {
    if (species && species !== 'all' && t.species !== species) return false;
    if (region && region !== 'all' && t.region !== region) return false;
    if (status && status !== 'all' && t.status !== status) return false;
    if (query) {
      const hay = [t.treeId, t.species, t.region, t.status, t.projectName].join(' ').toLowerCase();
      if (!hay.includes(query)) return false;
    }
    return true;
  });

  const totalCount = filtered.length;
  const safeLimit = Math.min(Math.max(limit, 1), 200);
  const safeOffset = Math.max(offset, 0);
  filtered = filtered.slice(safeOffset, safeOffset + safeLimit);

  return {
    trees: filtered,
    totalCount,
    limit: safeLimit,
    offset: safeOffset,
    cachedAt: base.cachedAt,
  };
}
