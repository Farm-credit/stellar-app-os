import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ActiveTreeOffsetRecord } from '../types';

// Mock the DB pool before importing the module under test.
const mockQuery = vi.fn();
vi.mock('@/lib/db/client', () => ({
  getPool: () => ({ query: mockQuery }),
}));

import {
  treeAgeYears,
  computeTreeOffsetKg,
  aggregateSnapshot,
  todayUtcDateString,
  fetchActiveTreeRecords,
  calculateSnapshot,
  upsertSnapshot,
  run,
} from '../worker';

const ONE_YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;
const NOW = new Date('2026-07-26T00:00:00.000Z');

function makeRecord(overrides: Partial<ActiveTreeOffsetRecord> = {}): ActiveTreeOffsetRecord {
  return {
    id: 1,
    speciesSlug: 'mangifera-indica',
    plantedAt: new Date(NOW.getTime() - 2 * ONE_YEAR_MS), // planted 2 years ago
    co2KgPerYear: 20,
    maturityYears: 10,
    ...overrides,
  };
}

describe('todayUtcDateString', () => {
  it('returns a YYYY-MM-DD string', () => {
    expect(todayUtcDateString()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('formats a given date in UTC', () => {
    expect(todayUtcDateString(new Date('2026-01-05T23:00:00.000Z'))).toBe('2026-01-05');
  });
});

describe('treeAgeYears', () => {
  it('computes fractional age in years', () => {
    const plantedAt = new Date(NOW.getTime() - 2 * ONE_YEAR_MS);
    expect(treeAgeYears(plantedAt, NOW)).toBeCloseTo(2, 2);
  });

  it('never returns a negative age (clock skew / future planted_at)', () => {
    const plantedAt = new Date(NOW.getTime() + ONE_YEAR_MS);
    expect(treeAgeYears(plantedAt, NOW)).toBe(0);
  });
});

describe('computeTreeOffsetKg', () => {
  it('prorates by age when younger than maturity', () => {
    const record = makeRecord({ co2KgPerYear: 20, maturityYears: 10 }); // 2 years old
    expect(computeTreeOffsetKg(record, NOW)).toBeCloseTo(40, 1); // 20 * 2
  });

  it('caps the contribution at maturity_years', () => {
    const record = makeRecord({
      plantedAt: new Date(NOW.getTime() - 50 * ONE_YEAR_MS), // 50 years old
      co2KgPerYear: 20,
      maturityYears: 10,
    });
    expect(computeTreeOffsetKg(record, NOW)).toBeCloseTo(200, 1); // capped at 20 * 10
  });

  it('returns null when the species has no rate data', () => {
    const record = makeRecord({ co2KgPerYear: null });
    expect(computeTreeOffsetKg(record, NOW)).toBeNull();
  });

  it('returns null for a zero or negative rate', () => {
    expect(computeTreeOffsetKg(makeRecord({ co2KgPerYear: 0 }), NOW)).toBeNull();
  });

  it('does not cap when maturity_years is unknown', () => {
    const record = makeRecord({
      plantedAt: new Date(NOW.getTime() - 50 * ONE_YEAR_MS),
      co2KgPerYear: 20,
      maturityYears: null,
    });
    expect(computeTreeOffsetKg(record, NOW)).toBeCloseTo(1000, 0); // 20 * 50, uncapped
  });
});

describe('aggregateSnapshot', () => {
  it('sums totals and buckets unrated trees separately', () => {
    const records = [
      makeRecord({ id: 1, speciesSlug: 'mangifera-indica', co2KgPerYear: 20 }), // 2yr -> 40kg
      makeRecord({ id: 2, speciesSlug: 'mangifera-indica', co2KgPerYear: 20 }), // 2yr -> 40kg
      makeRecord({ id: 3, speciesSlug: null, co2KgPerYear: null }), // unrated
    ];

    const result = aggregateSnapshot(records, NOW, 5);

    expect(result.activeTreeCount).toBe(3);
    expect(result.unratedTreeCount).toBe(1);
    expect(result.totalCo2OffsetKg).toBeCloseTo(80, 1);
    expect(result.totalCo2OffsetTonnes).toBeCloseTo(0.08, 4);
    expect(result.snapshotDate).toBe(todayUtcDateString(NOW));
    expect(result.computedInMs).toBe(5);
  });

  it('groups per-species breakdown and sorts by CO2 descending', () => {
    const records = [
      makeRecord({ id: 1, speciesSlug: 'species-a', co2KgPerYear: 5 }), // 2yr -> 10kg
      makeRecord({ id: 2, speciesSlug: 'species-b', co2KgPerYear: 50 }), // 2yr -> 100kg
      makeRecord({ id: 3, speciesSlug: 'species-a', co2KgPerYear: 5 }), // 2yr -> 10kg
    ];

    const result = aggregateSnapshot(records, NOW, 0);

    expect(result.bySpecies).toHaveLength(2);
    expect(result.bySpecies[0]).toMatchObject({ speciesSlug: 'species-b', activeTreeCount: 1 });
    expect(result.bySpecies[1]).toMatchObject({ speciesSlug: 'species-a', activeTreeCount: 2 });
  });

  it('returns zero totals for an empty active-tree list', () => {
    const result = aggregateSnapshot([], NOW, 0);

    expect(result.activeTreeCount).toBe(0);
    expect(result.unratedTreeCount).toBe(0);
    expect(result.totalCo2OffsetKg).toBe(0);
    expect(result.totalCo2OffsetTonnes).toBe(0);
    expect(result.bySpecies).toEqual([]);
  });
});

describe('fetchActiveTreeRecords', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('queries only planted/verified/completed, non-deleted, planted trees', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await fetchActiveTreeRecords({ query: mockQuery } as never);

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('t.status = ANY($1::text[])');
    expect(sql).toContain('t.deleted_at IS NULL');
    expect(sql).toContain('t.planted_at IS NOT NULL');
    expect(params[0]).toEqual(['planted', 'verified', 'completed']);
  });

  it('maps numeric/string DB fields into typed records', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 7,
          species_slug: 'mangifera-indica',
          planted_at: new Date('2024-01-01T00:00:00.000Z'),
          co2_kg_per_year: '20.5',
          maturity_years: 10,
        },
      ],
    });

    const records = await fetchActiveTreeRecords({ query: mockQuery } as never);

    expect(records).toEqual([
      {
        id: 7,
        speciesSlug: 'mangifera-indica',
        plantedAt: new Date('2024-01-01T00:00:00.000Z'),
        co2KgPerYear: 20.5,
        maturityYears: 10,
      },
    ]);
  });
});

describe('calculateSnapshot', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('fetches active trees and aggregates them without writing to the DB', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 1,
          species_slug: 'mangifera-indica',
          planted_at: new Date(NOW.getTime() - ONE_YEAR_MS),
          co2_kg_per_year: '20',
          maturity_years: 10,
        },
      ],
    });

    const result = await calculateSnapshot({ query: mockQuery } as never, NOW);

    expect(mockQuery).toHaveBeenCalledTimes(1); // fetch only, no upsert
    expect(result.activeTreeCount).toBe(1);
    expect(result.totalCo2OffsetKg).toBeCloseTo(20, 1);
  });
});

describe('run', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('calculates then upserts a snapshot row with ON CONFLICT on snapshot_date', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            species_slug: 'mangifera-indica',
            planted_at: new Date(NOW.getTime() - ONE_YEAR_MS),
            co2_kg_per_year: '20',
            maturity_years: 10,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });

    const result = await run({ query: mockQuery } as never, NOW);

    expect(mockQuery).toHaveBeenCalledTimes(2);
    const [upsertSql, upsertParams] = mockQuery.mock.calls[1];
    expect(upsertSql).toContain('ON CONFLICT (snapshot_date) DO UPDATE');
    expect(upsertParams[0]).toBe(result.snapshotDate);
    expect(upsertParams[1]).toBe(1);
  });

  it('propagates a fetch failure without attempting to upsert', async () => {
    mockQuery.mockRejectedValueOnce(new Error('connection terminated'));

    await expect(run({ query: mockQuery } as never, NOW)).rejects.toThrow('connection terminated');
    expect(mockQuery).toHaveBeenCalledTimes(1); // upsert never attempted
  });

  it('propagates an upsert failure', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockRejectedValueOnce(new Error('unique constraint violation'));

    await expect(run({ query: mockQuery } as never, NOW)).rejects.toThrow(
      'unique constraint violation'
    );
  });
});

describe('upsertSnapshot', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('serializes species breakdown as JSON and passes all fields positionally', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await upsertSnapshot({ query: mockQuery } as never, {
      snapshotDate: '2026-07-26',
      activeTreeCount: 2,
      unratedTreeCount: 1,
      totalCo2OffsetKg: 80,
      totalCo2OffsetTonnes: 0.08,
      bySpecies: [
        {
          speciesSlug: 'mangifera-indica',
          activeTreeCount: 2,
          co2OffsetKg: 80,
          co2OffsetTonnes: 0.08,
        },
      ],
      computedInMs: 12,
    });

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('INSERT INTO carbon_offset_snapshots');
    expect(params[0]).toBe('2026-07-26');
    expect(params[1]).toBe(2);
    expect(params[2]).toBe(1);
    expect(params[3]).toBe(80);
    expect(params[4]).toBe(0.08);
    expect(JSON.parse(params[5])).toEqual([
      {
        speciesSlug: 'mangifera-indica',
        activeTreeCount: 2,
        co2OffsetKg: 80,
        co2OffsetTonnes: 0.08,
      },
    ]);
    expect(params[6]).toBe(12);
  });
});
