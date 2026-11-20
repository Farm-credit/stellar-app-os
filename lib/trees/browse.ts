import type { ClimateZone } from '@/lib/constants/species';
import type { TreeSpecies } from '@/lib/types/tree';

export type GrowthRate = 'fast' | 'moderate' | 'slow';

export type TreeBrowseSortBy =
  'co2_desc' | 'co2_asc' | 'growth_rate' | 'price_asc' | 'price_desc' | 'name_asc';

export interface SponsorableTree {
  id: string;
  treeId: string;
  species: TreeSpecies;
  scientificName: string;
  nativeRegion: string;
  growthRate: GrowthRate;
  maturityYears: number;
  co2KgPerYear: number;
  priceUsd: number;
  availableCount: number;
  projectName: string;
  description: string;
  climateZone: ClimateZone;
}

export interface TreeBrowseFilters {
  search: string;
  species: TreeSpecies[];
  nativeRegion: string;
  growthRate: GrowthRate | 'all';
  minCo2KgPerYear?: number;
  maxCo2KgPerYear?: number;
  sortBy: TreeBrowseSortBy;
}

export const DEFAULT_TREE_BROWSE_FILTERS: TreeBrowseFilters = {
  search: '',
  species: [],
  nativeRegion: 'all',
  growthRate: 'all',
  minCo2KgPerYear: undefined,
  maxCo2KgPerYear: undefined,
  sortBy: 'co2_desc',
};

const GROWTH_RATE_RANK: Record<GrowthRate, number> = {
  fast: 0,
  moderate: 1,
  slow: 2,
};

export const SPONSORABLE_TREES: SponsorableTree[] = [
  {
    id: 'spon-eucalyptus-ke',
    treeId: 'HRV-SPON-001',
    species: 'Eucalyptus',
    scientificName: 'Eucalyptus grandis',
    nativeRegion: 'East Africa',
    growthRate: 'fast',
    maturityYears: 10,
    co2KgPerYear: 31,
    priceUsd: 18,
    availableCount: 140,
    projectName: 'Rift Valley Highland Reforestation',
    description:
      'Rapid-growing canopy species delivering high annual carbon sequestration for degraded highland watersheds.',
    climateZone: 'subtropical',
  },
  {
    id: 'spon-bamboo-sea',
    treeId: 'HRV-SPON-002',
    species: 'Bamboo (Moso)',
    scientificName: 'Phyllostachys edulis',
    nativeRegion: 'Southeast Asia',
    growthRate: 'fast',
    maturityYears: 5,
    co2KgPerYear: 35,
    priceUsd: 14,
    availableCount: 220,
    projectName: 'Mekong Riverbank Restoration',
    description:
      'Ultra-fast growing giant bamboo that stabilizes riverbanks and sequesters carbon at peak annual rates.',
    climateZone: 'tropical',
  },
  {
    id: 'spon-teak-wa',
    treeId: 'HRV-SPON-003',
    species: 'Teak',
    scientificName: 'Tectona grandis',
    nativeRegion: 'West Africa',
    growthRate: 'moderate',
    maturityYears: 20,
    co2KgPerYear: 22,
    priceUsd: 25,
    availableCount: 95,
    projectName: 'Northern Savanna Reforestation',
    description:
      'Durable hardwood prized for long-term carbon storage, soil stabilization, and community agroforestry.',
    climateZone: 'tropical',
  },
  {
    id: 'spon-mangrove-coast',
    treeId: 'HRV-SPON-004',
    species: 'Mangrove',
    scientificName: 'Rhizophora mangle',
    nativeRegion: 'Coastal Tropics',
    growthRate: 'moderate',
    maturityYears: 15,
    co2KgPerYear: 14,
    priceUsd: 16,
    availableCount: 310,
    projectName: 'Coastal Mangrove Recovery',
    description:
      'Blue-carbon coastal guardian that protects shorelines from erosion while sheltering marine nurseries.',
    climateZone: 'coastal',
  },
  {
    id: 'spon-moringa-wa',
    treeId: 'HRV-SPON-005',
    species: 'Moringa',
    scientificName: 'Moringa oleifera',
    nativeRegion: 'West Africa',
    growthRate: 'fast',
    maturityYears: 3,
    co2KgPerYear: 9,
    priceUsd: 10,
    availableCount: 400,
    projectName: 'Sahel Green Belt',
    description:
      'Drought-tolerant miracle tree supporting smallholder nutrition alongside rapid early canopy establishment.',
    climateZone: 'arid',
  },
  {
    id: 'spon-mahogany-wa',
    treeId: 'HRV-SPON-006',
    species: 'African Mahogany',
    scientificName: 'Khaya senegalensis',
    nativeRegion: 'West Africa',
    growthRate: 'slow',
    maturityYears: 30,
    co2KgPerYear: 26,
    priceUsd: 32,
    availableCount: 65,
    projectName: 'Upper Guinea Forest Corridor',
    description:
      'Majestic native timber species forming multi-decade carbon sinks and critical wildlife habitat.',
    climateZone: 'tropical',
  },
  {
    id: 'spon-baobab-ea',
    treeId: 'HRV-SPON-007',
    species: 'Baobab',
    scientificName: 'Adansonia digitata',
    nativeRegion: 'East Africa',
    growthRate: 'slow',
    maturityYears: 40,
    co2KgPerYear: 19,
    priceUsd: 35,
    availableCount: 45,
    projectName: 'Savanna Heritage Groves',
    description:
      'Iconic long-lived keystone species storing water and carbon across arid and semi-arid landscapes.',
    climateZone: 'arid',
  },
  {
    id: 'spon-acacia-ea',
    treeId: 'HRV-SPON-008',
    species: 'Acacia',
    scientificName: 'Acacia senegal',
    nativeRegion: 'East Africa',
    growthRate: 'moderate',
    maturityYears: 12,
    co2KgPerYear: 11,
    priceUsd: 12,
    availableCount: 275,
    projectName: 'Dryland Soil Revival',
    description:
      'Nitrogen-fixing native tree that restores depleted soils and thrives in low-rainfall regions.',
    climateZone: 'arid',
  },
  {
    id: 'spon-pine-ca',
    treeId: 'HRV-SPON-009',
    species: 'Caribbean Pine',
    scientificName: 'Pinus caribaea',
    nativeRegion: 'Central America',
    growthRate: 'fast',
    maturityYears: 12,
    co2KgPerYear: 24,
    priceUsd: 20,
    availableCount: 180,
    projectName: 'Mesoamerican Pine Ridge Recovery',
    description:
      'Resilient tropical pine accelerating watershed recovery and high-volume biomass accumulation.',
    climateZone: 'subtropical',
  },
  {
    id: 'spon-neem-sa',
    treeId: 'HRV-SPON-010',
    species: 'Neem',
    scientificName: 'Azadirachta indica',
    nativeRegion: 'South Asia',
    growthRate: 'moderate',
    maturityYears: 10,
    co2KgPerYear: 16,
    priceUsd: 15,
    availableCount: 190,
    projectName: 'Deccan Agroforestry Initiative',
    description:
      'Hardy evergreen providing shade, natural pest resilience, and steady year-round carbon uptake.',
    climateZone: 'subtropical',
  },
];

export function getAvailableSpecies(trees: SponsorableTree[]): TreeSpecies[] {
  return Array.from(new Set(trees.map((t) => t.species))).sort((a, b) => a.localeCompare(b));
}

export function getAvailableNativeRegions(trees: SponsorableTree[]): string[] {
  return Array.from(new Set(trees.map((t) => t.nativeRegion))).sort((a, b) => a.localeCompare(b));
}

export function filterAndSortSponsorableTrees(
  trees: SponsorableTree[],
  filters: TreeBrowseFilters
): SponsorableTree[] {
  const query = filters.search.trim().toLowerCase();

  const filtered = trees.filter((tree) => {
    if (query) {
      const haystack = [
        tree.species,
        tree.scientificName,
        tree.nativeRegion,
        tree.projectName,
        tree.treeId,
      ]
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(query)) {
        return false;
      }
    }

    if (filters.species.length > 0 && !filters.species.includes(tree.species)) {
      return false;
    }

    if (
      filters.nativeRegion &&
      filters.nativeRegion !== 'all' &&
      tree.nativeRegion !== filters.nativeRegion
    ) {
      return false;
    }

    if (filters.growthRate !== 'all' && tree.growthRate !== filters.growthRate) {
      return false;
    }

    if (
      filters.minCo2KgPerYear !== undefined &&
      !Number.isNaN(filters.minCo2KgPerYear) &&
      tree.co2KgPerYear < filters.minCo2KgPerYear
    ) {
      return false;
    }

    if (
      filters.maxCo2KgPerYear !== undefined &&
      !Number.isNaN(filters.maxCo2KgPerYear) &&
      tree.co2KgPerYear > filters.maxCo2KgPerYear
    ) {
      return false;
    }

    return true;
  });

  return [...filtered].sort((a, b) => {
    switch (filters.sortBy) {
      case 'co2_desc':
        return b.co2KgPerYear - a.co2KgPerYear || a.species.localeCompare(b.species);
      case 'co2_asc':
        return a.co2KgPerYear - b.co2KgPerYear || a.species.localeCompare(b.species);
      case 'growth_rate':
        return (
          GROWTH_RATE_RANK[a.growthRate] - GROWTH_RATE_RANK[b.growthRate] ||
          b.co2KgPerYear - a.co2KgPerYear
        );
      case 'price_asc':
        return a.priceUsd - b.priceUsd || b.co2KgPerYear - a.co2KgPerYear;
      case 'price_desc':
        return b.priceUsd - a.priceUsd || b.co2KgPerYear - a.co2KgPerYear;
      case 'name_asc':
        return a.species.localeCompare(b.species);
      default:
        return 0;
    }
  });
}
