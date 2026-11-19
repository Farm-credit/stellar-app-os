import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  DATA_REGIONS,
  getRegionalPool,
  queryAcrossRegions,
  resetRegionalPools,
  resolveDataRegion,
  type DataRegion,
} from '../data-residency';

// Mock pg so no real connections are opened.
vi.mock('pg', () => ({
  Pool: vi.fn(),
}));

import { Pool } from 'pg';

const EU_URL = 'postgres://eu-host/db';
const APAC_URL = 'postgres://apac-host/db';
const AMERICAS_URL = 'postgres://us-host/db';
const DEFAULT_URL = 'postgres://default-host/db';

function mockPoolFor(url: string, rows: unknown[] = []) {
  return {
    query: vi.fn().mockResolvedValue({ rows }),
    on: vi.fn(),
    end: vi.fn().mockResolvedValue(undefined),
    __url: url,
  };
}

describe('resolveDataRegion', () => {
  afterEach(() => {
    delete process.env.DATA_RESIDENCY_DEFAULT_REGION;
  });

  it('maps region names', () => {
    expect(resolveDataRegion('Europe')).toBe('eu');
    expect(resolveDataRegion('APAC')).toBe('apac');
    expect(resolveDataRegion('United States')).toBe('americas');
    expect(resolveDataRegion('UK')).toBe('eu');
    expect(resolveDataRegion('latin america')).toBe('americas');
  });

  it('maps ISO alpha-2 country codes', () => {
    expect(resolveDataRegion('DE')).toBe('eu');
    expect(resolveDataRegion('de')).toBe('eu');
    expect(resolveDataRegion('JP')).toBe('apac');
    expect(resolveDataRegion('NG')).toBe('americas'); // unmapped → default
  });

  it('respects the configured default region', () => {
    process.env.DATA_RESIDENCY_DEFAULT_REGION = 'apac';
    expect(resolveDataRegion('')).toBe('apac');
    expect(resolveDataRegion('unknown-place')).toBe('apac');
  });

  it('defaults to americas when nothing is configured', () => {
    expect(resolveDataRegion(undefined)).toBe('americas');
  });
});

describe('getRegionalPool / queryAcrossRegions', () => {
  let poolsByUrl: Record<string, ReturnType<typeof mockPoolFor>>;

  beforeEach(() => {
    vi.clearAllMocks();
    resetRegionalPools();

    process.env.DATABASE_URL = DEFAULT_URL;
    process.env.DATA_RESIDENCY_EU_DATABASE_URL = EU_URL;
    process.env.DATA_RESIDENCY_APAC_DATABASE_URL = APAC_URL;
    process.env.DATA_RESIDENCY_AMERICAS_DATABASE_URL = AMERICAS_URL;

    poolsByUrl = {
      [EU_URL]: mockPoolFor(EU_URL),
      [APAC_URL]: mockPoolFor(APAC_URL),
      [AMERICAS_URL]: mockPoolFor(AMERICAS_URL),
      [DEFAULT_URL]: mockPoolFor(DEFAULT_URL),
    };

    vi.mocked(Pool).mockImplementation(((config: { connectionString?: string }) => {
      const pool = poolsByUrl[config.connectionString ?? ''];
      if (!pool) throw new Error(`Unexpected connection string: ${config.connectionString}`);
      return pool as never;
    }) as never);
  });

  afterEach(() => {
    resetRegionalPools();
    delete process.env.DATA_RESIDENCY_EU_DATABASE_URL;
    delete process.env.DATA_RESIDENCY_APAC_DATABASE_URL;
    delete process.env.DATA_RESIDENCY_AMERICAS_DATABASE_URL;
    delete process.env.DATABASE_URL;
  });

  it('returns a dedicated pool per region from regional env vars', () => {
    expect(getRegionalPool('eu')).toBe(poolsByUrl[EU_URL]);
    expect(getRegionalPool('apac')).toBe(poolsByUrl[APAC_URL]);
    expect(getRegionalPool('americas')).toBe(poolsByUrl[AMERICAS_URL]);
  });

  it('caches pools so repeated calls reuse the same instance', () => {
    expect(getRegionalPool('eu')).toBe(getRegionalPool('eu'));
    expect(vi.mocked(Pool)).toHaveBeenCalledTimes(1);
  });

  it('falls back to DATABASE_URL when a regional URL is unset', () => {
    delete process.env.DATA_RESIDENCY_EU_DATABASE_URL;
    expect(getRegionalPool('eu')).toBe(poolsByUrl[DEFAULT_URL]);
  });

  it('throws when neither regional nor default URL is configured', () => {
    delete process.env.DATABASE_URL;
    delete process.env.DATA_RESIDENCY_APAC_DATABASE_URL;
    expect(() => getRegionalPool('apac')).toThrow(/No database URL configured/);
  });

  it('queryAcrossRegions returns rows from the region that owns them', async () => {
    poolsByUrl[EU_URL].query.mockResolvedValue({
      rows: [{ id: 'row-1', data_region: 'eu' as const }],
    });

    const result = await queryAcrossRegions('SELECT 1', ['row-1']);

    expect(result.region).toBe('eu');
    expect(result.rows).toEqual([{ id: 'row-1', data_region: 'eu' }]);
    // The lookup short-circuits at the first region that owns rows.
    expect(poolsByUrl[EU_URL].query).toHaveBeenCalled();
    expect(poolsByUrl[APAC_URL].query).not.toHaveBeenCalled();
    expect(poolsByUrl[AMERICAS_URL].query).not.toHaveBeenCalled();
  });

  it('queryAcrossRegions returns no rows when all regions are empty', async () => {
    const result = await queryAcrossRegions('SELECT 1', []);

    expect(result.region).toBeNull();
    expect(result.rows).toEqual([]);
    for (const region of DATA_REGIONS) {
      expect((getRegionalPool(region).query as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
    }
  });
});
