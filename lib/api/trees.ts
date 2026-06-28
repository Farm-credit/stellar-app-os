import { getMockTrees, getMockTreesResponse } from '@/lib/api/mock/trees';
import type { Tree, TreeFilterState, TreesResponse } from '@/lib/types/tree';

function buildQuery(filters: TreeFilterState): string {
  const params = new URLSearchParams();
  if (filters.search) params.set('search', filters.search);
  if (filters.species !== 'all') params.set('species', filters.species);
  if (filters.region !== 'all') params.set('region', filters.region);
  if (filters.status !== 'all') params.set('status', filters.status);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

function toTreesResponse(trees: Tree[], totalCount: number): TreesResponse {
  const allTrees = getMockTrees();
  return {
    trees,
    totalCount,
    speciesOptions: [...new Set(allTrees.map((t) => t.species))].sort(),
    regionOptions: [...new Set(allTrees.map((t) => t.region))].sort(),
    statusOptions: [...new Set(allTrees.map((t) => t.status))].sort(),
  };
}

export async function fetchTrees(filters: TreeFilterState): Promise<TreesResponse> {
  if (typeof window !== 'undefined') {
    const res = await fetch(`/api/trees${buildQuery(filters)}`);
    if (!res.ok) throw new Error('Failed to load trees');
    const data = (await res.json()) as { trees: Tree[]; totalCount: number };
    return toTreesResponse(data.trees, data.totalCount);
  }

  await new Promise((resolve) => setTimeout(resolve, 150));
  return getMockTreesResponse(filters);
}

export function fetchPublicTrees(filters: TreeFilterState): Promise<TreesResponse> {
  return fetchTrees(filters);
}

export async function fetchTreeById(id: string): Promise<Tree | null> {
  const res = await fetch(`/api/trees/${encodeURIComponent(id)}`);
  if (!res.ok) {
    if (res.status === 404) return null;
    throw new Error('Failed to load tree');
  }
  const data = (await res.json()) as { tree: Tree };
  return data.tree;
}
