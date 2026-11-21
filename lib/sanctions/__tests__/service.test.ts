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
    stellar_address: 'GCLEAR1ABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJ123456',
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
    const result = await callProvider('GCLEAR1ABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJ123456');
    expect(result.flagged).toBe(false);
    expect(result.provider).toBe('mock');
  });

  it('flags addresses that start with GBAD', async () => {
    const result = await callProvider('GBAD0ABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJ1234567');
    expect(result.flagged).toBe(true);
    expect(result.provider).toBe('mock');
  });

  it('includes raw_response with address field', async () => {
    const result = await callProvider('GCLEAR1ABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJ123456');
    expect(result.raw_response).toHaveProperty('address');
  });

  it('throws for unknown provider', async () => {
    vi.stubEnv('SANCTION_PROVIDER', 'unknown_provider');
    await expect(
      callProvider('GCLEAR1ABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJ123456')
    ).rejects.toThrow('Unknown SANCTION_PROVIDER');
  });
});

// ── getCachedResult ───────────────────────────────────────────────────────────

describe('getCachedResult', () => {
  it('returns null when no rows found', async () => {
    const pool = mockPool();
    vi.mocked(pool.query).mockResolvedValueOnce(queryResult([]));

    const result = await getCachedResult(
      pool,
      'GADDRESS1BCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEF1234567'
    );
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

  it('passes the stellar address as a query parameter', async () => {
    const pool = mockPool();
    vi.mocked(pool.query).mockResolvedValueOnce(queryResult([]));

    const address = 'GTEST1ABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJ1234567';
    await getCachedResult(pool, address);

    const [, params] = vi.mocked(pool.query).mock.calls[0] as [string, string[]];
    expect(params[0]).toBe(address);
  });
});

// ── upsertCache ───────────────────────────────────────────────────────────────

describe('upsertCache', () => {
  it('calls pool.query and returns the row', async () => {
    const pool = mockPool();
    const row = makeCacheRow({ result: 'flagged' });
    vi.mocked(pool.query).mockResolvedValueOnce(queryResult([row]));

    const result = await upsertCache(pool, row.stellar_address, 'flagged', 'mock', {
      flagged: true,
    });

    expect(result).toEqual(row);
    expect(pool.query).toHaveBeenCalledOnce();
    const sql = vi.mocked(pool.query).mock.calls[0][0] as string;
    expect(sql).toContain('INSERT INTO sanction_cache');
    expect(sql).toContain('ON CONFLICT');
    expect(sql).toContain('RETURNING');
  });
});

// ── recordAudit ───────────────────────────────────────────────────────────────

describe('recordAudit', () => {
  it('inserts into sanction_audit_log', async () => {
    const pool = mockPool();
    vi.mocked(pool.query).mockResolvedValueOnce(queryResult([]));

    await recordAudit(pool, {
      stellar_address: 'GCLEAR1ABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJ123456',
      result: 'clear',
      provider: 'mock',
      cache_hit: false,
      requested_by: 'admin_1',
      request_context: 'planter_registration',
    });

    expect(pool.query).toHaveBeenCalledOnce();
    const sql = vi.mocked(pool.query).mock.calls[0][0] as string;
    expect(sql).toContain('INSERT INTO sanction_audit_log');
  });

  it('handles null optional fields', async () => {
    const pool = mockPool();
    vi.mocked(pool.query).mockResolvedValueOnce(queryResult([]));

    await recordAudit(pool, {
      stellar_address: 'GCLEAR1ABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJ123456',
      result: 'clear',
      provider: 'mock',
      cache_hit: false,
    });

    const params = vi.mocked(pool.query).mock.calls[0][1] as unknown[];
    expect(params[4]).toBeNull(); // requested_by
    expect(params[5]).toBeNull(); // request_context
  });
});

// ── lookupSanctionList ────────────────────────────────────────────────────────

describe('lookupSanctionList', () => {
  beforeEach(() => {
    vi.stubEnv('SANCTION_PROVIDER', 'mock');
  });

  it('returns cached_clear when a valid cache entry exists', async () => {
    const pool = mockPool();
    const cacheRow = makeCacheRow({ result: 'clear' });
    // getCachedResult → cache hit
    vi.mocked(pool.query).mockResolvedValueOnce(queryResult([cacheRow]));
    // recordAudit
    vi.mocked(pool.query).mockResolvedValueOnce(queryResult([]));

    const result = await lookupSanctionList(pool, cacheRow.stellar_address);

    expect(result.cache_hit).toBe(true);
    expect(result.result).toBe('cached_clear');
    expect(result.stellar_address).toBe(cacheRow.stellar_address);
  });

  it('returns cached_flagged when cached entry is flagged', async () => {
    const pool = mockPool();
    const cacheRow = makeCacheRow({ result: 'flagged' });
    vi.mocked(pool.query).mockResolvedValueOnce(queryResult([cacheRow]));
    vi.mocked(pool.query).mockResolvedValueOnce(queryResult([]));

    const result = await lookupSanctionList(pool, cacheRow.stellar_address);

    expect(result.result).toBe('cached_flagged');
    expect(result.cache_hit).toBe(true);
  });

  it('calls provider and returns clear on cache miss', async () => {
    const address = 'GCLEAR1ABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJ123456';
    const pool = mockPool();
    const freshRow = makeCacheRow({ stellar_address: address, result: 'clear' });
    // getCachedResult → no rows
    vi.mocked(pool.query).mockResolvedValueOnce(queryResult([]));
    // upsertCache
    vi.mocked(pool.query).mockResolvedValueOnce(queryResult([freshRow]));
    // recordAudit
    vi.mocked(pool.query).mockResolvedValueOnce(queryResult([]));

    const result = await lookupSanctionList(pool, address);

    expect(result.result).toBe('clear');
    expect(result.cache_hit).toBe(false);
    expect(result.stellar_address).toBe(address);
  });

  it('returns flagged for a GBAD address on cache miss', async () => {
    const address = 'GBAD0ABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJ1234567';
    const pool = mockPool();
    const freshRow = makeCacheRow({ stellar_address: address, result: 'flagged' });
    vi.mocked(pool.query).mockResolvedValueOnce(queryResult([]));
    vi.mocked(pool.query).mockResolvedValueOnce(queryResult([freshRow]));
    vi.mocked(pool.query).mockResolvedValueOnce(queryResult([]));

    const result = await lookupSanctionList(pool, address);

    expect(result.result).toBe('flagged');
    expect(result.cache_hit).toBe(false);
  });

  it('returns error result when provider throws', async () => {
    vi.stubEnv('SANCTION_PROVIDER', 'chainalysis');
    vi.stubEnv('CHAINALYSIS_API_KEY', '');

    const pool = mockPool();
    // getCachedResult → no rows
    vi.mocked(pool.query).mockResolvedValueOnce(queryResult([]));
    // recordAudit for error path
    vi.mocked(pool.query).mockResolvedValueOnce(queryResult([]));

    const result = await lookupSanctionList(
      pool,
      'GCLEAR1ABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJ123456'
    );

    expect(result.result).toBe('error');
    expect(result.cache_hit).toBe(false);
  });
});
