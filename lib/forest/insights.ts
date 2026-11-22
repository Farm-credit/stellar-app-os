import type { Tree, TreeSpecies } from '@/lib/types/tree';

/**
 * My Forest dashboard helpers (#1641): health and growth classification,
 * quick filters, sorting and summary statistics for a sponsor's trees.
 */

export type TreeHealth = 'healthy' | 'establishing' | 'pending' | 'at_risk';

export const HEALTH_LABELS: Record<TreeHealth, string> = {
  healthy: 'Healthy',
  establishing: 'Establishing',
  pending: 'Awaiting planting',
  at_risk: 'At risk',
};

export type GrowthStage = 'not_planted' | 'seedling' | 'sapling' | 'young' | 'mature';

export const GROWTH_LABELS: Record<GrowthStage, string> = {
  not_planted: 'Not planted',
  seedling: 'Seedling',
  sapling: 'Sapling',
  young: 'Young tree',
  mature: 'Mature',
};

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

export function deriveHealth(tree: Pick<Tree, 'status'>): TreeHealth {
  switch (tree.status) {
    case 'failed':
      return 'at_risk';
    case 'funded':
      return 'pending';
    case 'planted':
      return 'establishing';
    default:
      return 'healthy';
  }
}

/** Whole and fractional years a tree has been in the ground (0 when unplanted). */
export function treeAgeYears(tree: Pick<Tree, 'plantedAt'>, now = new Date()): number {
  if (!tree.plantedAt) return 0;
  const planted = new Date(tree.plantedAt).getTime();
  if (Number.isNaN(planted)) return 0;
  return Math.max(0, (now.getTime() - planted) / MS_PER_YEAR);
}

export function deriveGrowthStage(
  tree: Pick<Tree, 'plantedAt' | 'status'>,
  now = new Date()
): GrowthStage {
  if (!tree.plantedAt || tree.status === 'funded' || tree.status === 'failed') {
    return 'not_planted';
  }
  const age = treeAgeYears(tree, now);
  if (age < 1) return 'seedling';
  if (age < 3) return 'sapling';
  if (age < 8) return 'young';
  return 'mature';
}

/** CO₂ absorbed to date: the annual rate multiplied by the years the tree has grown. */
export function co2AbsorbedKg(
  tree: Pick<Tree, 'plantedAt' | 'co2OffsetKgPerYear'>,
  now = new Date()
): number {
  return tree.co2OffsetKgPerYear * treeAgeYears(tree, now);
}

export interface ForestQuickFilters {
  species: TreeSpecies | 'all';
  health: TreeHealth | 'all';
  region: string | 'all';
}

export const DEFAULT_QUICK_FILTERS: ForestQuickFilters = {
  species: 'all',
  health: 'all',
  region: 'all',
};

export function filterTrees(trees: Tree[], filters: ForestQuickFilters): Tree[] {
  return trees.filter(
    (tree) =>
      (filters.species === 'all' || tree.species === filters.species) &&
      (filters.region === 'all' || tree.region === filters.region) &&
      (filters.health === 'all' || deriveHealth(tree) === filters.health)
  );
}

export type ForestSortKey = 'species' | 'region' | 'health' | 'planted' | 'co2';
export type SortDirection = 'asc' | 'desc';

const HEALTH_ORDER: Record<TreeHealth, number> = {
  at_risk: 0,
  pending: 1,
  establishing: 2,
  healthy: 3,
};

export function sortTrees(
  trees: Tree[],
  key: ForestSortKey,
  direction: SortDirection,
  now = new Date()
): Tree[] {
  const factor = direction === 'asc' ? 1 : -1;
  const compare = (a: Tree, b: Tree): number => {
    switch (key) {
      case 'species':
        return a.species.localeCompare(b.species);
      case 'region':
        return a.region.localeCompare(b.region);
      case 'health':
        return HEALTH_ORDER[deriveHealth(a)] - HEALTH_ORDER[deriveHealth(b)];
      case 'planted':
        return (
          (a.plantedAt ? new Date(a.plantedAt).getTime() : Infinity) -
          (b.plantedAt ? new Date(b.plantedAt).getTime() : Infinity)
        );
      case 'co2':
        return co2AbsorbedKg(a, now) - co2AbsorbedKg(b, now);
    }
  };
  return [...trees].sort((a, b) => {
    const result = compare(a, b);
    if (result === 0 || Number.isNaN(result)) return a.treeId.localeCompare(b.treeId);
    return result * factor;
  });
}

export interface ForestSummary {
  totalTrees: number;
  totalCo2AbsorbedKg: number;
  /** Years since the earliest planted tree; 0 if nothing is planted yet. */
  yearsSponsored: number;
}

export function summariseForest(trees: Tree[], now = new Date()): ForestSummary {
  const totalCo2AbsorbedKg = trees.reduce((sum, t) => sum + co2AbsorbedKg(t, now), 0);
  const yearsSponsored = trees.reduce((max, t) => Math.max(max, treeAgeYears(t, now)), 0);
  return { totalTrees: trees.length, totalCo2AbsorbedKg, yearsSponsored };
}

export function formatCo2(kg: number): string {
  return kg >= 1000 ? `${(kg / 1000).toFixed(1)} t` : `${Math.round(kg)} kg`;
}
