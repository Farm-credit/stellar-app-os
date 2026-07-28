import { describe, it, expect } from 'vitest';
import { computeTreeCumulativeKg, computeCarbonSummary } from '../carbonOffset';

// Helper to build a mock pool
function makeMockPool(rows: any[]) {
  return {
    query: async (_sql: string) => ({ rows }),
  };
}

describe('computeTreeCumulativeKg', () => {
  it('returns 0 when not planted', () => {
    const kg = computeTreeCumulativeKg(null, 48, 25, new Date('2024-01-01').getTime());
    expect(kg).toBe(0);
  });

  it('computes expected cumulative kg with given years and rate', () => {
    // planted 2 years earlier
    const now = new Date('2024-01-01').getTime();
    const plantedAt = new Date('2022-01-01').toISOString();
    const kg = computeTreeCumulativeKg(plantedAt, 48, 25, now);
    // approx 2 years * 48
    expect(Math.round(kg)).toBeGreaterThanOrEqual(95);
    expect(Math.round(kg)).toBeLessThanOrEqual(98);
  });

  it('applies maturity cap', () => {
    const now = new Date('2050-01-01').getTime();
    const plantedAt = new Date('2020-01-01').toISOString();
    // maturity 5 years -> capped at 5 * rate
    const kg = computeTreeCumulativeKg(plantedAt, 22, 5, now);
    expect(Math.round(kg)).toBe(22 * 5);
  });

  it('uses default rate when co2 rate missing', () => {
    const now = new Date('2024-01-01').getTime();
    const plantedAt = new Date('2023-01-01').toISOString();
    const kg = computeTreeCumulativeKg(plantedAt, null, null, now);
    // default CO2_KG_PER_TREE = 48 -> ~1 year => ~48 kg
    expect(Math.round(kg)).toBeGreaterThanOrEqual(47);
    expect(Math.round(kg)).toBeLessThanOrEqual(49);
  });
});

describe('computeCarbonSummary', () => {
  it('aggregates rows and returns totals', async () => {
    const now = new Date('2024-01-01').getTime();

    const rows = [
      {
        species_slug: 'teak',
        planted_at: '2020-01-01T00:00:00Z',
        co2_kg_per_year: '22',
        maturity_years: 20,
      },
      {
        species_slug: null,
        planted_at: '2023-01-01T00:00:00Z',
        co2_kg_per_year: null,
        maturity_years: null,
      },
    ];

    const mockPool = makeMockPool(rows);
    const summary = await computeCarbonSummary(mockPool as any, now);

    expect(summary.totalTrees).toBe(2);
    // approximate expected kg: teak -> ~4yrs * 22 = 88; unknown -> ~1yr * 48 = 48 -> ~136
    expect(summary.totalCo2OffsetKg).toBeGreaterThanOrEqual(130);
    expect(summary.totalCo2OffsetKg).toBeLessThanOrEqual(140);
    expect(summary.bySpecies.some((s) => s.speciesSlug === 'teak')).toBe(true);
    expect(summary.bySpecies.some((s) => s.speciesSlug === null)).toBe(true);
  });
});
