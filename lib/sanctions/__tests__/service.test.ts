import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import {
  callProvider,
  getCachedResult,
  upsertCache,
  recordAudit,
  lookupSanctionList,
} from '@/lib/sanctions/service';
import type { SanctionCacheRow } from '@/lib/types/sanctions';

// ── Helpers ───────────────────────────────────────────────────────────────────

function mockPool(overrides: Partial<Pool> = {}): Pool {
  return {
    query: vi.fn(),
    ...overrides,
  } as unknown as Pool;
}

function makeCacheRow(overrides: Partial<SanctionCacheRow> = {}): SanctionCacheRow {
  const now = new Date('2026-01-01T12:00:00Z');
  const expires = new Date(now.getTime() + 86_400_000);
  return {
    id: 1,
    stellar_address: 'GCLEAR1ABCDEFGHIJKLMNOPQRSTUVWXYZ23456789ABCDEF123456',
    result: 'clear',
    provider: 'mock',
    raw_response: null,
    checked_at: now,
    cache_expires_at: expires,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

function queryResult<T>(rows: T[]): QueryResult<T> {
  return { rows, command: '', oid: 0, fields: [], rowCount: rows.length } as QueryResult<T>;
}

// ── callProvider (mock mode) ──────────────────────────────────────────────────

describe('callProvider (mock)', () => {
  beforeEach(() => {
    vi.stubEnv('SANCTION_PROVIDER', 'mock');
  });

  it('returns clear for a normal address', async () => {
    const result = await callProvider('GCLEAR1ABCDEFGHIJKLMNOPQRSTUVWXYZ23456789ABCDEF123456');
    expect(result.flagged).toBe(false);
    expect(result.provider).toBe('mock');
  });

  it('flags addresses that start with GBAD', async () => {
    const result = await callProvider('GBAD0ABCDEFGHIJKLMNOPQRSTUVWXYZ23456789ABCDEF123456');
    expect(result.flagged).toBe(true);
    expect(result.provider).toBe('mock');
  });

  it('includes raw_response', async () => {
    const result = await callProvider('GCLEAR1ABCDEFGHIJKLMNOPQRSTUVWXYZ23456789ABCDEF123456');
    expect(result.raw_response).toHaveProperty('address');
  });
});

// ── getCachedResult ───────────────────────────────────────────────────────────

describe('getCachedResult', () => {
  it('returns null when no rows found', async () => {
    const pool = mockPool();
    vi.mocked(pool.query).mockResolvedValueOnce(queryResult([]));

    const result = await getCachedResult(pool, 'GADDRESS');
    expect(result).toBeNull();
    expect(pool.query).toHaveBeenCalledOnce();
  });

  it('returns the cache row when found', async () => {
    const pool = mockPool();
    const row = makeCacheRow();
    vi.mocked(pool.query).mockResolvedValueOnce(queryResult([row]));

    const result = await getCachedResult(pool, row.stellar_address);
    expect(result).toEqual(row);
  });
});

// ── upsertCache ───────────────────────────────────────────────────────────────

describe('upsertCache', () => {
  it('calls INSERT … ON CONFLICT and returns the row', async () => {
    const pool = mockPool();
    const row = makeCacheRow();
    vi.mocked(pool.query).mockResolvedValueOnce(queryResult([row]));

    const result = await upsertCache(pool, row.stellar_address, 'clear', 'mock', {});
    expect(result).toEqual(row);
    expect(pool.query).toHaveBeenCalledOnce();
    const sql = vi.mocked(pool.query).mock.calls[0][0] as string;
    expect(sql).toContain('ON CONFLICT');
    expect(sql).toContain('RETURNING');
  });
});

// ── recordAudit ───────────────────────────────────────────────────────────────

describe('recordAudit', () => {
  it('inserts a row into sanction_audit_log', async () => {
    const pool = mockPool();
    vi.mocked(pool.query).mockResolvedValueOnce(queryResult([]));

    await recordAudit(pool, {
      stellar_address: 'GCLEAR1ABCDEFGHIJKLMNOPQRSTUVWXYZ23456789ABCDEF123456',
      result: 'clear',
      provider: 'mock',
      cache_hit: false,
    });

    expect(pool.query).toHaveBeenCalledOnce();
    const sql = vi.mocked(pool.query).mock.calls[0][0] as string;
    expect(sql).toContain('INSERT INTO sanction_audit_log');
  });

  it('passes cache_hit, requested_by, and request_context to the query', async () => {
    const pool = mockPool();
    vi.mocked(pool.query).mockResolvedValueOnce(queryResult([]));

    await recordAudit(pool, {
      stellar_address: 'GCLEAR1ABCDEFGHIJKLMNOPQRSTUVWXYZ23456789ABCDEF123456',
      result: 'cached_clear',
      provider: 'mock',
      cache_hit: true,
      requested_by: 'admin_1',
      request_context: 'planter_registration',
    });

    const args = vi.mocked(pool.query).mock.calls[0][1] as unknown[];
    expect(args).toContain(true);           // cache_hit
    expect(args).toContain('admin_1');      // requested_by
    expect(args).toContain('planter_registration'); // request_context
  });
});

// ── lookupSanctionList ────────────────────────────────────────────────────────

describe('lookupSanctionList', () => {
  beforeEach(() => {
    vi.stubEnv('SANCTION_PROVIDER', 'mock');
  });

  it('returns cached_clear on a fresh cache hit', async () => {
    const pool = mockPool();
    const cachedRow = makeCacheRow({ result: 'clear' });
    // getCachedResult → returns cached row
    vi.mocked(pool.query)
      .mockResolvedValueOnce(queryResult([cachedRow]))  // getCachedResult
      .mockResolvedValueOnce(queryResult([]));           // recordAudit

    const result = await lookupSanctionList(pool, cachedRow.stellar_address);

    expect(result.result).toBe('cached_clear');
    expect(result.cache_hit).toBe(true);
    expect(result.provider).toBe('mock');
  });

  it('performs a live check on cache miss and returns clear for a normal address', async () => {
    const pool = mockPool();
    const cacheRow = makeCacheRow();

    vi.mocked(pool.query)
      .mockResolvedValueOnce(queryResult([]))    // getCachedResult → miss
      .mockResolvedValueOnce(queryResult([cacheRow])) // upsertCache
      .mockResolvedValueOnce(queryResult([]));        // recordAudit

    const result = await lookupSanctionList(
      pool,
      'GCLEAR1ABCDEFGHIJKLMNOPQRSTUVWXYZ23456789ABCDEF123456'
    );

    expect(result.result).toBe('clear');
    expect(result.cache_hit).toBe(false);
  });

  it('returns flagged for an address starting with GBAD', async () => {
    const pool = mockPool();
    const flaggedRow = makeCacheRow({ result: 'flagged' });

    vi.mocked(pool.query)
      .mockResolvedValueOnce(queryResult([]))         // cache miss
      .mockResolvedValueOnce(queryResult([flaggedRow])) // upsertCache
      .mockResolvedValueOnce(queryResult([]));          // recordAudit

    const result = await lookupSanctionList(
      pool,
      'GBAD0ABCDEFGHIJKLMNOPQRSTUVWXYZ23456789ABCDEF123456'
    );

    expect(result.result).toBe('flagged');
  });

  it('returns error when provider throws and still records audit', async () => {
    const pool = mockPool();
    vi.stubEnv('SANCTION_PROVIDER', 'chainalysis');
    // chainalysis requires CHAINALYSIS_API_KEY → will throw
    vi.stubEnv('CHAINALYSIS_API_KEY', '');

    vi.mocked(pool.query)
      .mockResolvedValueOnce(queryResult([]))  // cache miss
      .mockResolvedValueOnce(queryResult([])); // recordAudit for error

    const result = await lookupSanctionList(
      pool,
      'GCLEAR1ABCDEFGHIJKLMNOPQRSTUVWXYZ23456789ABCDEF123456'
    );

    expect(result.result).toBe('error');
    expect(result.cache_hit).toBe(false);
  });

  it('tolerates cache read errors without throwing', async () => {
    const pool = mockPool();
    const cacheRow = makeCacheRow();

    vi.mocked(pool.query)
      .mockRejectedValueOnce(new Error('DB timeout'))      // getCachedResult fails
      .mockResolvedValueOnce(queryResult([cacheRow]))       // upsertCache
      .mockResolvedValueOnce(queryResult([]));              // recordAudit

    // Should not throw; falls through to live check
    const result = await lookupSanctionList(
      pool,
      'GCLEAR1ABCDEFGHIJKLMNOPQRSTUVWXYZ23456789ABCDEF123456'
    );

    expect(result.result).toBe('clear');
  });
});
