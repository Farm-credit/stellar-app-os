import { describe, expect, it } from 'vitest';
import type { Tree } from '@/lib/types/tree';
import {
  co2AbsorbedKg,
  deriveGrowthStage,
  deriveHealth,
  filterTrees,
  formatCo2,
  sortTrees,
  summariseForest,
} from '../insights';

const NOW = new Date('2026-06-01T00:00:00Z');

function makeTree(overrides: Partial<Tree>): Tree {
  return {
    id: 'id',
    treeId: 'T-1',
    species: 'Teak',
    region: 'Kano, Nigeria',
    status: 'verified',
    plantedAt: '2024-06-01T00:00:00Z',
    lat: 12,
    lng: 8,
    co2OffsetKgPerYear: 20,
    projectName: 'P',
    ...overrides,
  };
}

describe('forest insights', () => {
  it('derives health from status', () => {
    expect(deriveHealth({ status: 'failed' })).toBe('at_risk');
    expect(deriveHealth({ status: 'funded' })).toBe('pending');
    expect(deriveHealth({ status: 'planted' })).toBe('establishing');
    expect(deriveHealth({ status: 'verified' })).toBe('healthy');
    expect(deriveHealth({ status: 'completed' })).toBe('healthy');
  });

  it('derives growth stage from age', () => {
    expect(deriveGrowthStage(makeTree({ status: 'funded', plantedAt: undefined }), NOW)).toBe(
      'not_planted'
    );
    expect(deriveGrowthStage(makeTree({ plantedAt: '2026-01-01T00:00:00Z' }), NOW)).toBe(
      'seedling'
    );
    expect(deriveGrowthStage(makeTree({ plantedAt: '2024-06-01T00:00:00Z' }), NOW)).toBe('sapling');
    expect(deriveGrowthStage(makeTree({ plantedAt: '2021-06-01T00:00:00Z' }), NOW)).toBe('young');
    expect(deriveGrowthStage(makeTree({ plantedAt: '2010-06-01T00:00:00Z' }), NOW)).toBe('mature');
  });

  it('computes CO2 absorbed to date', () => {
    expect(co2AbsorbedKg(makeTree({}), NOW)).toBeCloseTo(40, 0);
    expect(co2AbsorbedKg(makeTree({ plantedAt: undefined }), NOW)).toBe(0);
  });

  it('filters by species, health and region', () => {
    const trees = [
      makeTree({ treeId: 'A' }),
      makeTree({ treeId: 'B', species: 'Neem', status: 'failed' }),
      makeTree({ treeId: 'C', region: 'Kaduna, Nigeria' }),
    ];
    const ids = (f: Parameters<typeof filterTrees>[1]) =>
      filterTrees(trees, f).map((t) => t.treeId);
    expect(ids({ species: 'Neem', health: 'all', region: 'all' })).toEqual(['B']);
    expect(ids({ species: 'all', health: 'at_risk', region: 'all' })).toEqual(['B']);
    expect(ids({ species: 'all', health: 'all', region: 'Kaduna, Nigeria' })).toEqual(['C']);
    expect(ids({ species: 'all', health: 'all', region: 'all' })).toHaveLength(3);
  });

  it('sorts in both directions without mutating the input', () => {
    const trees = [
      makeTree({ treeId: 'A', species: 'Teak' }),
      makeTree({ treeId: 'B', species: 'Baobab' }),
    ];
    expect(sortTrees(trees, 'species', 'asc', NOW).map((t) => t.treeId)).toEqual(['B', 'A']);
    expect(sortTrees(trees, 'species', 'desc', NOW).map((t) => t.treeId)).toEqual(['A', 'B']);
    expect(trees[0].treeId).toBe('A');
  });

  it('sorts unplanted trees last by planted date ascending', () => {
    const trees = [
      makeTree({ treeId: 'U', plantedAt: undefined, status: 'funded' }),
      makeTree({ treeId: 'P', plantedAt: '2025-01-01T00:00:00Z' }),
    ];
    expect(sortTrees(trees, 'planted', 'asc', NOW).map((t) => t.treeId)).toEqual(['P', 'U']);
  });

  it('summarises trees, CO2 and years sponsored', () => {
    const summary = summariseForest(
      [
        makeTree({ plantedAt: '2024-06-01T00:00:00Z' }),
        makeTree({ plantedAt: '2025-06-01T00:00:00Z' }),
      ],
      NOW
    );
    expect(summary.totalTrees).toBe(2);
    expect(summary.yearsSponsored).toBeCloseTo(2, 0);
    expect(summary.totalCo2AbsorbedKg).toBeCloseTo(60, 0);
  });

  it('formats CO2', () => {
    expect(formatCo2(450)).toBe('450 kg');
    expect(formatCo2(2500)).toBe('2.5 t');
  });
});
