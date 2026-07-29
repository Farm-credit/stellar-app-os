/**
 * Integration tests for `lib/db/photo-hashes.ts` — Issue #825.
 *
 * The tests mock `@/lib/db/client` so no real Postgres connection is needed.
 * Each scenario verifies:
 *   • Exact-match lookup hits
 *   • Near-duplicate detection (Hamming ≤ threshold)
 *   • Above-threshold distance returns null
 *   • recordPhotoHash error handling (missing table ⇒ no-op + warn)
 *   • listHashesForEntity pagination + ordering
 *
 * Note on id shape: `lib/db/client.ts` registers a global BIGINT parser
 * (`pg.types.setTypeParser(20, parseInt)`) so all ids come back as plain
 * JavaScript numbers.  The mocks mirror that wire shape via `asRow()`.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { PHashHex } from '@/lib/image/phash';

// ── Hoisted mocks ────────────────────────────────────────────────────────────

const queryMock = vi.fn();

vi.mock('@/lib/db/client', () => ({
  getPool: () => ({
    query: (...args: unknown[]) => queryMock(...args),
  }),
}));

// Reset cached server version between tests by clearing module cache for the
// implementation file.  Vitest exposes `vi.resetModules()` for this.
beforeEach(() => {
  vi.resetModules();
  queryMock.mockReset();
});

// ── Helpers ─────────────────────────────────────────────────────────────────

interface FakeRow {
  id: number;
  entity_type: 'tree' | 'planter';
  entity_id: string;
  hash_hex: string;
  storage_ref: string;
  metadata: Record<string, unknown>;
  duplicate_of: number | null;
  created_at: Date;
}

function fakeRow(over: Partial<FakeRow> = {}): FakeRow {
  return {
    id: 1,
    entity_type: 'tree',
    entity_id: 'HRV-2024-0001',
    hash_hex: '0123456789abcdef',
    storage_ref: 'planting-photos/farmer-1/1234.jpg',
    metadata: {},
    duplicate_of: null,
    created_at: new Date('2025-01-01T00:00:00Z'),
    ...over,
  };
}

// ── recordPhotoHash ─────────────────────────────────────────────────────────

describe('recordPhotoHash', () => {
  it('inserts and returns the new id', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: 42 }], rowCount: 1 });
    const { recordPhotoHash } = await import('@/lib/db/photo-hashes');
    const id = await recordPhotoHash({
      entityType: 'tree',
      entityId: 'HRV-2024-0001',
      hashHex: '0123456789abcdef' as PHashHex,
      storageRef: 'planting-photos/farmer-1/1234.jpg',
    });
    expect(id).toBe(42);
    expect(queryMock).toHaveBeenCalledTimes(1);
    const [sql, params] = queryMock.mock.calls[0]!;
    expect(sql).toMatch(/INSERT INTO photo_hashes/);
    expect(sql).toMatch(/ON CONFLICT/);
    expect(params[0]).toBe('tree');
    expect(params[1]).toBe('HRV-2024-0001');
    expect(params[2]).toBe('0123456789abcdef');
  });

  it('returns null + warns when the table is missing', async () => {
    queryMock.mockRejectedValueOnce(
      Object.assign(new Error('relation "photo_hashes" does not exist'), {})
    );
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { recordPhotoHash } = await import('@/lib/db/photo-hashes');
    const id = await recordPhotoHash({
      entityType: 'tree',
      entityId: 'HRV-2024-0001',
      hashHex: '0123456789abcdef' as PHashHex,
      storageRef: 'planting-photos/farmer-1/1234.jpg',
    });
    expect(id).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('photo_hashes table missing'));
    warn.mockRestore();
  });

  it('rejects malformed hex', async () => {
    const { recordPhotoHash } = await import('@/lib/db/photo-hashes');
    await expect(
      recordPhotoHash({
        entityType: 'tree',
        entityId: 'HRV-2024-0001',
        hashHex: 'BADHEX!@#$%^&*ab' as unknown as PHashHex,
        storageRef: 'k',
      })
    ).rejects.toThrow(/lowercase base-16/);
  });

  it('rejects missing entityId / storageRef', async () => {
    const { recordPhotoHash } = await import('@/lib/db/photo-hashes');
    await expect(
      recordPhotoHash({
        entityType: 'tree',
        entityId: '',
        hashHex: '0123456789abcdef' as PHashHex,
        storageRef: 'k',
      })
    ).rejects.toThrow(/entityId/);
    await expect(
      recordPhotoHash({
        entityType: 'tree',
        entityId: 'X',
        hashHex: '0123456789abcdef' as PHashHex,
        storageRef: '',
      })
    ).rejects.toThrow(/storageRef/);
  });
});

// ── findDuplicate ───────────────────────────────────────────────────────────

describe('findDuplicate', () => {
  it('returns a match within threshold', async () => {
    // SHOW server_version + the duplicate query
    queryMock.mockResolvedValueOnce({ rows: [{ v: '14.5' }] }); // version probe
    queryMock.mockResolvedValueOnce({
      rows: [{ ...fakeRow({ id: 7, hash_hex: '0123456789abcdee' }), distance: '1' }],
      rowCount: 1,
    });
    const { findDuplicate } = await import('@/lib/db/photo-hashes');
    const match = await findDuplicate('0123456789abcdef' as PHashHex, { threshold: 5 });
    expect(match).not.toBeNull();
    expect(match!.distance).toBe(1);
    // BIGINT ids come back parsed as numbers (see lib/db/client.ts).
    expect(match!.row.id).toBe(7);
  });

  it('returns null when no row is within threshold', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ v: '14.5' }] });
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const { findDuplicate } = await import('@/lib/db/photo-hashes');
    const match = await findDuplicate('0123456789abcdef' as PHashHex, { threshold: 5 });
    expect(match).toBeNull();
  });

  it('returns null + warns when table missing', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ v: '14.5' }] });
    queryMock.mockRejectedValueOnce(
      Object.assign(new Error('relation "photo_hashes" does not exist'), {})
    );
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { findDuplicate } = await import('@/lib/db/photo-hashes');
    const match = await findDuplicate('0123456789abcdef' as PHashHex);
    expect(match).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('uses the portable XOR query for older Postgres versions', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ v: '13.10' }] });
    queryMock.mockResolvedValueOnce({
      rows: [{ ...fakeRow(), distance: '2' }],
      rowCount: 1,
    });
    const { findDuplicate } = await import('@/lib/db/photo-hashes');
    const match = await findDuplicate('0123456789abcdef' as PHashHex, { threshold: 5 });
    expect(match).not.toBeNull();
    expect(match!.distance).toBe(2);
    const sql = queryMock.mock.calls[1]![0] as string;
    // portable fallback uses length(replace(...)) not bit_count
    expect(sql).toMatch(/length\(replace/);
    expect(sql).not.toMatch(/bit_count/);
  });

  it('uses decode() for parameterised hex decoding (no SQL interpolation)', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ v: '14.5' }] });
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const { findDuplicate } = await import('@/lib/db/photo-hashes');
    await findDuplicate('0123456789abcdef' as PHashHex, { threshold: 5 });
    const sql = queryMock.mock.calls[1]![0] as string;
    // Candidate hash must be passed as a parameter and decoded server-side,
    // never inlined as a B'…'::bit(64) literal.
    expect(sql).toMatch(/decode\(\$2, 'hex'\)::bit\(64\)/);
    expect(sql).not.toMatch(/B'01/);
  });
});

// ── findExactDuplicate ──────────────────────────────────────────────────────

describe('findExactDuplicate', () => {
  it('finds an exact match', async () => {
    queryMock.mockResolvedValueOnce({ rows: [fakeRow({ id: 1 })], rowCount: 1 });
    const { findExactDuplicate } = await import('@/lib/db/photo-hashes');
    const row = await findExactDuplicate('0123456789abcdef' as PHashHex);
    expect(row?.id).toBe(1);
    expect(row?.hash_hex).toBe('0123456789abcdef');
  });

  it('returns null when no exact match', async () => {
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const { findExactDuplicate } = await import('@/lib/db/photo-hashes');
    const row = await findExactDuplicate('0123456789abcdef' as PHashHex);
    expect(row).toBeNull();
  });
});

// ── listHashesForEntity ─────────────────────────────────────────────────────

describe('listHashesForEntity', () => {
  it('returns newest-first results', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [fakeRow({ id: 2 }), fakeRow({ id: 1 })],
      rowCount: 2,
    });
    const { listHashesForEntity } = await import('@/lib/db/photo-hashes');
    const rows = await listHashesForEntity('tree', 'HRV-2024-0001');
    expect(rows).toHaveLength(2);
    expect(rows[0]!.id).toBe(2);
  });

  it('clamps limit between 1 and 200', async () => {
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const { listHashesForEntity } = await import('@/lib/db/photo-hashes');
    await listHashesForEntity('tree', 'HRV-2024-0001', 9999);
    const params = queryMock.mock.calls[0]![1] as unknown[];
    expect(params[2]).toBe(200);
  });
});

// ── checkAndRecordPhotoHash ─────────────────────────────────────────────────

describe('checkAndRecordPhotoHash', () => {
  it('rejects and reports the match when a duplicate is found', async () => {
    // findDuplicate: SHOW + match query
    queryMock.mockResolvedValueOnce({ rows: [{ v: '14.5' }] });
    queryMock.mockResolvedValueOnce({
      rows: [{ ...fakeRow({ id: 5 }), distance: '3' }],
      rowCount: 1,
    });
    const { checkAndRecordPhotoHash } = await import('@/lib/db/photo-hashes');
    const result = await checkAndRecordPhotoHash({
      entityType: 'tree',
      entityId: 'HRV-2024-0002',
      hashHex: '0123456789abcdef' as PHashHex,
      storageRef: 'k',
    });
    expect(result.match).not.toBeNull();
    expect(result.match!.distance).toBe(3);
    expect(result.rowId).toBeNull();
  });

  it('records the hash and returns rowId when there is no duplicate', async () => {
    // findDuplicate: SHOW + empty result
    queryMock.mockResolvedValueOnce({ rows: [{ v: '14.5' }] });
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    // recordPhotoHash: INSERT
    queryMock.mockResolvedValueOnce({ rows: [{ id: 99 }], rowCount: 1 });
    const { checkAndRecordPhotoHash } = await import('@/lib/db/photo-hashes');
    const result = await checkAndRecordPhotoHash({
      entityType: 'tree',
      entityId: 'HRV-2024-0003',
      hashHex: '0123456789abcdef' as PHashHex,
      storageRef: 'k',
    });
    expect(result.match).toBeNull();
    expect(result.rowId).toBe(99);
  });
});

// ── getPhotoHashStats ───────────────────────────────────────────────────────

describe('getPhotoHashStats', () => {
  it('aggregates counts per entity_type', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          total: '150',
          trees: '100',
          planters: '50',
          oldest: new Date('2024-06-01'),
          newest: new Date('2025-01-01'),
        },
      ],
      rowCount: 1,
    });
    const { getPhotoHashStats } = await import('@/lib/db/photo-hashes');
    const stats = await getPhotoHashStats();
    expect(stats.total).toBe(150);
    expect(stats.byEntityType.tree).toBe(100);
    expect(stats.byEntityType.planter).toBe(50);
  });

  it('returns zero stats when table missing', async () => {
    queryMock.mockRejectedValueOnce(
      Object.assign(new Error('relation "photo_hashes" does not exist'), {})
    );
    const { getPhotoHashStats } = await import('@/lib/db/photo-hashes');
    const stats = await getPhotoHashStats();
    expect(stats.total).toBe(0);
    expect(stats.byEntityType).toEqual({ tree: 0, planter: 0 });
    expect(stats.oldestHashAt).toBeNull();
  });
});

// ── Configuration env var parsing ───────────────────────────────────────────

describe('configuration helpers', () => {
  it('reads PHASH_DUPLICATE_THRESHOLD from env', async () => {
    process.env.PHASH_DUPLICATE_THRESHOLD = '12';
    const { getDuplicateThreshold } = await import('@/lib/db/photo-hashes');
    expect(getDuplicateThreshold()).toBe(12);
    delete process.env.PHASH_DUPLICATE_THRESHOLD;
  });

  it('falls back to default on invalid env', async () => {
    process.env.PHASH_DUPLICATE_THRESHOLD = 'not-a-number';
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { getDuplicateThreshold } = await import('@/lib/db/photo-hashes');
    expect(getDuplicateThreshold()).toBe(5);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
    delete process.env.PHASH_DUPLICATE_THRESHOLD;
  });
});
