/**
 * Unit tests for the Tree Registry API endpoints — Issue #542
 *
 * Tests cover:
 *   • GET /api/trees  — list, filtering, pagination, 30s cache
 *   • GET /api/trees/:id — found, 404, empty id
 *
 * Horizon and the contract layer are fully mocked so no real network is hit.
 */

import { cacheGet, cacheSet, cacheClear } from '@/lib/api/tree-registry-cache';
import { getTreeList, getTreeById } from '@/lib/api/tree-registry';

// ── mock the heavy imports that are irrelevant to unit tests ──────────────────

jest.mock('@stellar/stellar-sdk', () => ({
  Horizon: {
    Server: jest.fn().mockImplementation(() => ({
      payments: jest.fn().mockReturnValue({
        forAccount: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            order: jest.fn().mockReturnValue({
              call: jest.fn().mockResolvedValue({ records: [] }),
            }),
          }),
        }),
      }),
    })),
  },
}));

jest.mock('@/lib/stellar/tree-asset', () => ({
  TREE_ISSUER_TESTNET: 'G_MOCK_ISSUER',
  getTreeAsset: jest.fn(),
  getTreeExplorerUrl: jest.fn(),
  TREE_ISSUER_MAINNET: '',
  TREE_DISTRIBUTOR_TESTNET: '',
  CO2_KG_PER_TREE: 48,
}));

jest.mock('@/lib/config/network', () => ({
  networkConfig: { horizonUrl: 'https://horizon-testnet.stellar.org', networkPassphrase: 'Test' },
}));

// ── helpers ───────────────────────────────────────────────────────────────────

beforeEach(() => cacheClear());

// ── cache unit ────────────────────────────────────────────────────────────────

describe('tree-registry-cache', () => {
  it('returns null for an empty cache', () => {
    expect(cacheGet('missing')).toBeNull();
  });

  it('stores and retrieves a value within TTL', () => {
    cacheSet('foo', { bar: 1 });
    expect(cacheGet('foo')).toEqual({ bar: 1 });
  });

  it('returns null after TTL has passed', () => {
    jest.useFakeTimers();
    cacheSet('ttl-test', 'value');
    jest.advanceTimersByTime(31_000); // 31s > 30s TTL
    expect(cacheGet('ttl-test')).toBeNull();
    jest.useRealTimers();
  });
});

// ── getTreeList ───────────────────────────────────────────────────────────────

describe('getTreeList', () => {
  it('returns trees with correct shape', async () => {
    const result = await getTreeList();
    expect(result.trees.length).toBeGreaterThan(0);
    expect(result).toHaveProperty('totalCount');
    expect(result).toHaveProperty('cachedAt');
    expect(result).toHaveProperty('limit');
    expect(result).toHaveProperty('offset');
  });

  it('filters by species correctly', async () => {
    const result = await getTreeList({ species: 'Teak' });
    expect(result.trees.every((t) => t.species === 'Teak')).toBe(true);
  });

  it('filters by status correctly', async () => {
    const result = await getTreeList({ status: 'verified' });
    expect(result.trees.every((t) => t.status === 'verified')).toBe(true);
  });

  it('paginates correctly', async () => {
    const page1 = await getTreeList({ limit: 2, offset: 0 });
    const page2 = await getTreeList({ limit: 2, offset: 2 });
    expect(page1.trees.length).toBe(2);
    expect(page2.trees[0]?.id).not.toEqual(page1.trees[0]?.id);
  });

  it('returns empty array for unknown species', async () => {
    const result = await getTreeList({ species: 'Bamboo' });
    expect(result.trees).toHaveLength(0);
    expect(result.totalCount).toBe(0);
  });

  it('serves from cache on second call (same cachedAt)', async () => {
    const first = await getTreeList();
    const second = await getTreeList();
    expect(second.cachedAt).toBe(first.cachedAt);
  });

  it('clamps limit to max 200', async () => {
    const result = await getTreeList({ limit: 9999 });
    expect(result.limit).toBe(200);
  });

  it('free-text search finds matching trees', async () => {
    const result = await getTreeList({ search: 'Mangrove' });
    expect(result.trees.length).toBeGreaterThan(0);
    expect(result.trees.every((t) => t.species === 'Mangrove')).toBe(true);
  });
});

// ── getTreeById ───────────────────────────────────────────────────────────────

describe('getTreeById', () => {
  it('returns a tree for a valid treeId', async () => {
    const tree = await getTreeById('HRV-2024-0001');
    expect(tree).not.toBeNull();
    expect(tree?.treeId).toBe('HRV-2024-0001');
  });

  it('returns a tree for an internal id', async () => {
    const tree = await getTreeById('tree-001');
    expect(tree).not.toBeNull();
    expect(tree?.id).toBe('tree-001');
  });

  it('returns null for a non-existent id', async () => {
    const tree = await getTreeById('does-not-exist-9999');
    expect(tree).toBeNull();
  });

  it('returns null for empty string', async () => {
    const tree = await getTreeById('');
    expect(tree).toBeNull();
  });
});
