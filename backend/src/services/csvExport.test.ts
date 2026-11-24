/**
 * Unit tests for the CSV Export service.
 *
 * Uses a mock pg Pool so no real database connection is required.
 * Covers: normal output, empty results, date/status filters, and row escaping.
 *
 * Closes #1116
 */

import { describe, it, expect, vi } from 'vitest';
import { generateTreesCsv, generateSponsorsCsv, generatePlantersCsv } from './csvExport';
import type { Pool, QueryResult } from 'pg';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function mockPool(rows: Record<string, unknown>[]): Pool {
  return {
    query: vi.fn().mockResolvedValue({ rows, rowCount: rows.length } as QueryResult),
  } as unknown as Pool;
}

// ---------------------------------------------------------------------------
// Trees
// ---------------------------------------------------------------------------

describe('generateTreesCsv', () => {
  it('returns a header row even when there are no data rows', async () => {
    const pool = mockPool([]);
    const csv = await generateTreesCsv(pool, {});

    const lines = csv.split('\n');
    expect(lines).toHaveLength(1); // header only
    expect(lines[0]).toContain('id');
    expect(lines[0]).toContain('species');
    expect(lines[0]).toContain('status');
    expect(lines[0]).toContain('planter_name');
  });

  it('includes data rows with correct field mapping', async () => {
    const fakeRow = {
      id: '42',
      tree_ref: 'TRF-042',
      species: 'Teak',
      region: 'Ogun',
      country_code: 'NG',
      lat: '6.8643',
      lng: '3.5950',
      status: 'planted',
      planter_id: '7',
      planter_name: 'Aminu Danladi',
      planted_at: '2026-01-15T00:00:00.000Z',
      verified_at: null,
      completed_at: null,
      created_at: '2026-01-10T00:00:00.000Z',
    };
    const pool = mockPool([fakeRow]);
    const csv = await generateTreesCsv(pool, {});

    const lines = csv.split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('42');
    expect(lines[1]).toContain('Teak');
    expect(lines[1]).toContain('Aminu Danladi');
  });

  it('passes startDate and endDate as positional params to the query', async () => {
    const pool = mockPool([]);
    const querySpy = pool.query as ReturnType<typeof vi.fn>;

    await generateTreesCsv(pool, {
      startDate: '2026-01-01',
      endDate: '2026-06-30',
    });

    expect(querySpy).toHaveBeenCalledOnce();
    const [, params] = querySpy.mock.calls[0] as [string, unknown[]];
    expect(params).toContain('2026-01-01');
    expect(params).toContain('2026-06-30');
  });

  it('passes status filter when provided', async () => {
    const pool = mockPool([]);
    const querySpy = pool.query as ReturnType<typeof vi.fn>;

    await generateTreesCsv(pool, { status: 'verified' });

    const [, params] = querySpy.mock.calls[0] as [string, unknown[]];
    expect(params).toContain('verified');
  });

  it('escapes commas and double-quotes inside cell values', async () => {
    const fakeRow = {
      id: '1',
      tree_ref: 'T1',
      species: 'Oak, "White"',
      region: 'North',
      country_code: 'US',
      lat: '40',
      lng: '-74',
      status: 'planted',
      planter_id: '1',
      planter_name: 'John "JJ" Doe',
      planted_at: null,
      verified_at: null,
      completed_at: null,
      created_at: '2026-01-01T00:00:00.000Z',
    };
    const pool = mockPool([fakeRow]);
    const csv = await generateTreesCsv(pool, {});

    expect(csv).toContain('"Oak, ""White"""');
    expect(csv).toContain('"John ""JJ"" Doe"');
  });

  it('caps limit at 50 000 regardless of caller input', async () => {
    const pool = mockPool([]);
    const querySpy = pool.query as ReturnType<typeof vi.fn>;

    await generateTreesCsv(pool, { limit: 999_999 });

    const [, params] = querySpy.mock.calls[0] as [string, unknown[]];
    // The last param is always the LIMIT value
    expect(params[params.length - 1]).toBe(50_000);
  });
});

// ---------------------------------------------------------------------------
// Sponsors
// ---------------------------------------------------------------------------

describe('generateSponsorsCsv', () => {
  it('returns header row when no sponsors exist', async () => {
    const pool = mockPool([]);
    const csv = await generateSponsorsCsv(pool, {});
    expect(csv.split('\n')).toHaveLength(1);
    expect(csv).toContain('total_trees');
    expect(csv).toContain('total_amount_usd');
  });

  it('includes sponsor rows correctly', async () => {
    const fakeRow = {
      id: '10',
      name: 'Acme Corp',
      email: 'green@acme.com',
      total_trees: '120',
      total_amount_usd: '2400.00',
      first_sponsored_at: '2025-03-01T00:00:00.000Z',
      last_sponsored_at: '2026-09-01T00:00:00.000Z',
      created_at: '2025-02-01T00:00:00.000Z',
    };
    const pool = mockPool([fakeRow]);
    const csv = await generateSponsorsCsv(pool, {});
    expect(csv).toContain('Acme Corp');
    expect(csv).toContain('120');
  });

  it('applies startDate filter', async () => {
    const pool = mockPool([]);
    const querySpy = pool.query as ReturnType<typeof vi.fn>;

    await generateSponsorsCsv(pool, { startDate: '2026-01-01' });

    const [, params] = querySpy.mock.calls[0] as [string, unknown[]];
    expect(params).toContain('2026-01-01');
  });
});

// ---------------------------------------------------------------------------
// Planters
// ---------------------------------------------------------------------------

describe('generatePlantersCsv', () => {
  it('returns header row when no planters exist', async () => {
    const pool = mockPool([]);
    const csv = await generatePlantersCsv(pool, {});
    expect(csv.split('\n')).toHaveLength(1);
    expect(csv).toContain('kyc_status');
    expect(csv).toContain('total_trees_planted');
    expect(csv).toContain('verified_count');
  });

  it('includes planter rows correctly', async () => {
    const fakeRow = {
      id: '5',
      full_name: 'Ngozi Obi',
      country_code: 'NG',
      region: 'Rivers',
      kyc_status: 'verified',
      total_trees_planted: '35',
      verified_count: '30',
      created_at: '2025-06-01T00:00:00.000Z',
    };
    const pool = mockPool([fakeRow]);
    const csv = await generatePlantersCsv(pool, {});
    expect(csv).toContain('Ngozi Obi');
    expect(csv).toContain('35');
    expect(csv).toContain('verified');
  });

  it('filters by kyc_status when status filter is provided', async () => {
    const pool = mockPool([]);
    const querySpy = pool.query as ReturnType<typeof vi.fn>;

    await generatePlantersCsv(pool, { status: 'verified' });

    const [, params] = querySpy.mock.calls[0] as [string, unknown[]];
    expect(params).toContain('verified');
  });

  it('filters by date range', async () => {
    const pool = mockPool([]);
    const querySpy = pool.query as ReturnType<typeof vi.fn>;

    await generatePlantersCsv(pool, {
      startDate: '2025-01-01',
      endDate: '2026-01-01',
    });

    const [, params] = querySpy.mock.calls[0] as [string, unknown[]];
    expect(params).toContain('2025-01-01');
    expect(params).toContain('2026-01-01');
  });
});
