import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TREE_BROWSE_FILTERS,
  SPONSORABLE_TREES,
  filterAndSortSponsorableTrees,
  getAvailableNativeRegions,
  getAvailableSpecies,
} from '@/lib/trees/browse';

describe('lib/trees/browse', () => {
  it('returns sorted unique species and native regions', () => {
    const species = getAvailableSpecies(SPONSORABLE_TREES);
    const regions = getAvailableNativeRegions(SPONSORABLE_TREES);

    expect(species.length).toBeGreaterThan(0);
    expect([...species].sort((a, b) => a.localeCompare(b))).toEqual(species);
    expect(regions).toContain('West Africa');
    expect(regions).toContain('East Africa');
    expect([...regions].sort((a, b) => a.localeCompare(b))).toEqual(regions);
  });

  it('filters by multiple selected species', () => {
    const result = filterAndSortSponsorableTrees(SPONSORABLE_TREES, {
      ...DEFAULT_TREE_BROWSE_FILTERS,
      species: ['Teak', 'Mangrove'],
    });

    expect(result).toHaveLength(2);
    expect(result.map((t) => t.species).sort()).toEqual(['Mangrove', 'Teak']);
  });

  it('filters by native region', () => {
    const result = filterAndSortSponsorableTrees(SPONSORABLE_TREES, {
      ...DEFAULT_TREE_BROWSE_FILTERS,
      nativeRegion: 'East Africa',
    });

    expect(result.length).toBeGreaterThan(0);
    expect(result.every((t) => t.nativeRegion === 'East Africa')).toBe(true);
  });

  it('filters by growth rate', () => {
    const result = filterAndSortSponsorableTrees(SPONSORABLE_TREES, {
      ...DEFAULT_TREE_BROWSE_FILTERS,
      growthRate: 'fast',
    });

    expect(result.length).toBeGreaterThan(0);
    expect(result.every((t) => t.growthRate === 'fast')).toBe(true);
  });

  it('filters by CO2 absorption rate range', () => {
    const result = filterAndSortSponsorableTrees(SPONSORABLE_TREES, {
      ...DEFAULT_TREE_BROWSE_FILTERS,
      minCo2KgPerYear: 20,
      maxCo2KgPerYear: 30,
    });

    expect(result.length).toBeGreaterThan(0);
    expect(result.every((t) => t.co2KgPerYear >= 20 && t.co2KgPerYear <= 30)).toBe(true);
  });

  it('sorts by CO2 sequestration rate descending and ascending', () => {
    const desc = filterAndSortSponsorableTrees(SPONSORABLE_TREES, {
      ...DEFAULT_TREE_BROWSE_FILTERS,
      sortBy: 'co2_desc',
    });
    for (let i = 1; i < desc.length; i += 1) {
      expect(desc[i - 1].co2KgPerYear).toBeGreaterThanOrEqual(desc[i].co2KgPerYear);
    }

    const asc = filterAndSortSponsorableTrees(SPONSORABLE_TREES, {
      ...DEFAULT_TREE_BROWSE_FILTERS,
      sortBy: 'co2_asc',
    });
    for (let i = 1; i < asc.length; i += 1) {
      expect(asc[i - 1].co2KgPerYear).toBeLessThanOrEqual(asc[i].co2KgPerYear);
    }
  });

  it('combines search, region, and species filters accurately', () => {
    const result = filterAndSortSponsorableTrees(SPONSORABLE_TREES, {
      ...DEFAULT_TREE_BROWSE_FILTERS,
      nativeRegion: 'West Africa',
      species: ['Teak', 'Moringa'],
      growthRate: 'fast',
    });

    expect(result).toHaveLength(1);
    expect(result[0].species).toBe('Moringa');
  });
});
