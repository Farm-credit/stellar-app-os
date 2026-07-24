import { TREE_SPECIES } from '@/lib/constants/species';
import type { Tree, TreeFilterState, TreesResponse } from '@/lib/types/tree';

const co2BySpecies = Object.fromEntries(
  TREE_SPECIES.map((s) => [s.name, s.co2KgPerYear])
) as Record<Tree['species'], number>;

/** Fuzzed coordinates — region-centred, never exact planter GPS. */
const MOCK_TREES: Tree[] = [
  {
    id: 'tree-001',
    treeId: 'HRV-2024-0001',
    species: 'Teak',
    region: 'Kano, Nigeria',
    status: 'verified',
    plantedAt: '2024-03-12T08:00:00Z',
    lat: 12.04,
    lng: 8.48,
    co2OffsetKgPerYear: co2BySpecies.Teak,
    projectName: 'Northern Savanna Reforestation',
  },
  {
    id: 'tree-002',
    treeId: 'HRV-2024-0002',
    species: 'Moringa',
    region: 'Kano, Nigeria',
    status: 'planted',
    plantedAt: '2024-05-20T10:30:00Z',
    lat: 11.98,
    lng: 8.55,
    co2OffsetKgPerYear: co2BySpecies.Moringa,
    projectName: 'Northern Savanna Reforestation',
  },
  {
    id: 'tree-003',
    treeId: 'HRV-2024-0003',
    species: 'Eucalyptus',
    region: 'Kaduna, Nigeria',
    status: 'completed',
    plantedAt: '2023-11-05T14:00:00Z',
    lat: 10.48,
    lng: 7.4,
    co2OffsetKgPerYear: co2BySpecies.Eucalyptus,
    projectName: 'Central Belt Afforestation',
  },
  {
    id: 'tree-004',
    treeId: 'HRV-2024-0004',
    species: 'Mangrove',
    region: 'Greater Accra, Ghana',
    status: 'verified',
    plantedAt: '2024-01-18T09:15:00Z',
    lat: 5.58,
    lng: -0.18,
    co2OffsetKgPerYear: co2BySpecies.Mangrove,
    projectName: 'Coastal Mangrove Recovery',
  },
  {
    id: 'tree-005',
    treeId: 'HRV-2024-0005',
    species: 'Teak',
    region: 'Kaduna, Nigeria',
    status: 'funded',
    lat: 10.55,
    lng: 7.5,
    co2OffsetKgPerYear: co2BySpecies.Teak,
    projectName: 'Central Belt Afforestation',
  },
  {
    id: 'tree-006',
    treeId: 'HRV-2024-0006',
    species: 'Moringa',
    region: 'Sokoto, Nigeria',
    status: 'planted',
    plantedAt: '2024-06-02T07:45:00Z',
    lat: 13.02,
    lng: 5.28,
    co2OffsetKgPerYear: co2BySpecies.Moringa,
    projectName: 'Sahel Green Belt',
  },
  {
    id: 'tree-007',
    treeId: 'HRV-2024-0007',
    species: 'Eucalyptus',
    region: 'Nairobi, Kenya',
    status: 'verified',
    plantedAt: '2024-02-28T11:00:00Z',
    lat: -1.27,
    lng: 36.78,
    co2OffsetKgPerYear: co2BySpecies.Eucalyptus,
    projectName: 'East Africa Urban Greening',
  },
  {
    id: 'tree-008',
    treeId: 'HRV-2024-0008',
    species: 'Mangrove',
    region: 'Kampala, Uganda',
    status: 'failed',
    plantedAt: '2023-09-14T16:20:00Z',
    lat: 0.3,
    lng: 32.55,
    co2OffsetKgPerYear: co2BySpecies.Mangrove,
    projectName: 'Lake Victoria Watershed',
  },
  {
    id: 'tree-009',
    treeId: 'HRV-2024-0009',
    species: 'Teak',
    region: 'Niger State, Nigeria',
    status: 'completed',
    plantedAt: '2023-07-22T08:30:00Z',
    lat: 9.9,
    lng: 5.65,
    co2OffsetKgPerYear: co2BySpecies.Teak,
    projectName: 'Middle Belt Restoration',
  },
  {
    id: 'tree-010',
    treeId: 'HRV-2024-0010',
    species: 'Moringa',
    region: 'Greater Accra, Ghana',
    status: 'funded',
    lat: 5.62,
    lng: -0.22,
    co2OffsetKgPerYear: co2BySpecies.Moringa,
    projectName: 'Coastal Mangrove Recovery',
  },
  {
    id: 'tree-011',
    treeId: 'HRV-2024-0011',
    species: 'Eucalyptus',
    region: 'Sokoto, Nigeria',
    status: 'planted',
    plantedAt: '2024-04-10T13:00:00Z',
    lat: 13.08,
    lng: 5.2,
    co2OffsetKgPerYear: co2BySpecies.Eucalyptus,
    projectName: 'Sahel Green Belt',
  },
  {
    id: 'tree-012',
    treeId: 'HRV-2024-0012',
    species: 'Mangrove',
    region: 'Kano, Nigeria',
    status: 'verified',
    plantedAt: '2024-03-30T10:00:00Z',
    lat: 12.02,
    lng: 8.5,
    co2OffsetKgPerYear: co2BySpecies.Mangrove,
    projectName: 'Northern Savanna Reforestation',
  },
  {
    id: 'tree-013',
    treeId: 'HRV-2024-0013',
    species: 'Teak',
    region: 'Nairobi, Kenya',
    status: 'planted',
    plantedAt: '2024-05-15T09:30:00Z',
    lat: -1.31,
    lng: 36.85,
    co2OffsetKgPerYear: co2BySpecies.Teak,
    projectName: 'East Africa Urban Greening',
  },
  {
    id: 'tree-014',
    treeId: 'HRV-2024-0014',
    species: 'Moringa',
    region: 'Kampala, Uganda',
    status: 'verified',
    plantedAt: '2024-01-08T12:00:00Z',
    lat: 0.34,
    lng: 32.6,
    co2OffsetKgPerYear: co2BySpecies.Moringa,
    projectName: 'Lake Victoria Watershed',
  },
  {
    id: 'tree-015',
    treeId: 'HRV-2024-0015',
    species: 'Eucalyptus',
    region: 'Niger State, Nigeria',
    status: 'funded',
    lat: 9.96,
    lng: 5.58,
    co2OffsetKgPerYear: co2BySpecies.Eucalyptus,
    projectName: 'Middle Belt Restoration',
  },
];

export function getMockTrees(): Tree[] {
  return MOCK_TREES;
}

export function getMockTreeById(id: string): Tree | undefined {
  return MOCK_TREES.find((t) => t.id === id);
}

export function getMockTreesResponse(filters: TreeFilterState): TreesResponse {
  const allTrees = getMockTrees();
  const filtered = filterTrees(allTrees, filters);

  return {
    trees: filtered,
    speciesOptions: [...new Set(allTrees.map((t) => t.species))].sort(),
    regionOptions: [...new Set(allTrees.map((t) => t.region))].sort(),
    statusOptions: [...new Set(allTrees.map((t) => t.status))].sort(),
    totalCount: filtered.length,
  };
}

export function filterTrees(trees: Tree[], filters: TreeFilterState): Tree[] {
  const query = filters.search.trim().toLowerCase();

  return trees.filter((tree) => {
    if (filters.species !== 'all' && tree.species !== filters.species) return false;
    if (filters.region !== 'all' && tree.region !== filters.region) return false;
    if (filters.status !== 'all' && tree.status !== filters.status) return false;

    if (!query) return true;

    const haystack = [tree.treeId, tree.species, tree.region, tree.status, tree.projectName]
      .join(' ')
      .toLowerCase();

    return haystack.includes(query);
  });
}
