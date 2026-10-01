import { describe, expect, it } from 'vitest';
import {
  GROWTH_TIMELINE_ANCHOR_MS,
  SPECIES_GROWTH_PROFILES,
  TREE_MATURITY_YEARS,
  buildMonthlyGrowthSeries,
  growthAtYear,
  hashToUnit,
} from './model';
import { TREE_SPECIES } from '@/lib/constants/species';

const PLANTED_AT = Date.UTC(2024, 2, 12);

describe('growth model', () => {
  it('defines a growth profile for every catalogued species', () => {
    for (const species of TREE_SPECIES) {
      const profile = SPECIES_GROWTH_PROFILES[species.name];
      expect(profile, `missing profile for ${species.name}`).toBeDefined();
      expect(profile.matureHeightCm).toBeGreaterThan(0);
      expect(profile.matureCanopyCm).toBeGreaterThan(0);
      expect(profile.matureTrunkMm).toBeGreaterThan(0);
    }
  });

  it('hashes seeds deterministically into the unit interval', () => {
    expect(hashToUnit('tree-001')).toBe(hashToUnit('tree-001'));
    expect(hashToUnit('tree-001')).toBeGreaterThanOrEqual(0);
    expect(hashToUnit('tree-001')).toBeLessThan(1);
    expect(hashToUnit('tree-001')).not.toBe(hashToUnit('tree-002'));
  });

  describe('growthAtYear', () => {
    it('starts at zero size the day it is planted', () => {
      const snapshot = growthAtYear('Teak', 0);
      expect(snapshot.heightCm).toBe(0);
      expect(snapshot.canopyCm).toBe(0);
      expect(snapshot.cumulativeCo2Kg).toBe(0);
      expect(snapshot.maturityProgress).toBe(0);
    });

    it('grows monotonically with age', () => {
      let previousHeight = 0;
      for (let year = 1; year <= TREE_MATURITY_YEARS; year += 1) {
        const snapshot = growthAtYear('Teak', year);
        expect(snapshot.heightCm).toBeGreaterThan(previousHeight);
        previousHeight = snapshot.heightCm;
      }
    });

    it('caps the projection at the 20-year maturity horizon', () => {
      const atTwenty = growthAtYear('Teak', TREE_MATURITY_YEARS);
      const beyond = growthAtYear('Teak', TREE_MATURITY_YEARS + 15);

      expect(atTwenty.maturityProgress).toBe(1);
      expect(beyond.heightCm).toBe(atTwenty.heightCm);
      expect(beyond.maturityProgress).toBe(1);
    });

    it('accumulates more CO₂ as the tree ages', () => {
      const oneYear = growthAtYear('Moringa', 1);
      const fiveYears = growthAtYear('Moringa', 5);

      expect(fiveYears.cumulativeCo2Kg).toBeGreaterThan(oneYear.cumulativeCo2Kg);
      // Young trees sequester less than the mature annual rate.
      expect(oneYear.annualCo2Kg).toBeLessThan(20);
    });

    it('never reports negative values for negative ages', () => {
      const snapshot = growthAtYear('Baobab', -5);
      expect(snapshot.heightCm).toBe(0);
      expect(snapshot.annualCo2Kg).toBe(0);
    });
  });

  describe('buildMonthlyGrowthSeries', () => {
    it('returns an empty series when nothing has grown yet', () => {
      expect(buildMonthlyGrowthSeries('Teak', PLANTED_AT, 'tree-001', PLANTED_AT)).toEqual([]);
    });

    it('is deterministic for the same tree and seed', () => {
      const first = buildMonthlyGrowthSeries('Teak', PLANTED_AT, 'tree-001');
      const second = buildMonthlyGrowthSeries('Teak', PLANTED_AT, 'tree-001');
      expect(first).toEqual(second);
    });

    it('gives different trees of the same species their own growth', () => {
      const first = buildMonthlyGrowthSeries('Teak', PLANTED_AT, 'tree-001');
      const second = buildMonthlyGrowthSeries('Teak', PLANTED_AT, 'tree-042');

      expect(first[first.length - 1].heightCm).not.toBe(second[second.length - 1].heightCm);
    });

    it('starts at the planting month and advances one month at a time', () => {
      const series = buildMonthlyGrowthSeries('Moringa', PLANTED_AT, 'tree-002');

      expect(series[0].monthIndex).toBe(0);
      expect(series[0].capturedAtMs).toBe(PLANTED_AT);
      for (let index = 1; index < series.length; index += 1) {
        expect(series[index].monthIndex).toBe(index);
        expect(series[index].capturedAtMs).toBeGreaterThan(series[index - 1].capturedAtMs);
        expect(series[index].cumulativeCo2Kg).toBeGreaterThanOrEqual(
          series[index - 1].cumulativeCo2Kg
        );
      }
    });

    it('never runs past the maturity horizon', () => {
      const series = buildMonthlyGrowthSeries('Teak', Date.UTC(1990, 0, 1), 'old-tree');
      expect(series.length).toBe(TREE_MATURITY_YEARS * 12 + 1);
      expect(series[series.length - 1].year).toBe(TREE_MATURITY_YEARS);
    });

    it('uses the fixed anchor by default', () => {
      const series = buildMonthlyGrowthSeries('Teak', PLANTED_AT, 'tree-001');
      const last = series[series.length - 1];
      expect(last.capturedAtMs).toBeLessThanOrEqual(GROWTH_TIMELINE_ANCHOR_MS);
    });
  });
});
