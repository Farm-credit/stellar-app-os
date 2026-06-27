import type { Tree } from '@/lib/types/tree';

export interface RegionCluster {
  region: string;
  lat: number;
  lng: number;
  treeCount: number;
  speciesBreakdown: Record<string, number>;
  totalCo2KgPerYear: number;
  trees: Tree[];
}

/** Group verified trees into region clusters for map display (#532). */
export function clusterTreesByRegion(trees: Tree[]): RegionCluster[] {
  const groups = new Map<string, Tree[]>();

  for (const tree of trees) {
    const existing = groups.get(tree.region) ?? [];
    existing.push(tree);
    groups.set(tree.region, existing);
  }

  return [...groups.entries()].map(([region, regionTrees]) => {
    const lat = regionTrees.reduce((sum, t) => sum + t.lat, 0) / regionTrees.length;
    const lng = regionTrees.reduce((sum, t) => sum + t.lng, 0) / regionTrees.length;
    const speciesBreakdown: Record<string, number> = {};

    for (const tree of regionTrees) {
      speciesBreakdown[tree.species] = (speciesBreakdown[tree.species] ?? 0) + 1;
    }

    return {
      region,
      lat,
      lng,
      treeCount: regionTrees.length,
      speciesBreakdown,
      totalCo2KgPerYear: regionTrees.reduce((sum, t) => sum + t.co2OffsetKgPerYear, 0),
      trees: regionTrees,
    };
  });
}
