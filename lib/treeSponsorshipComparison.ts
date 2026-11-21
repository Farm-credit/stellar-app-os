// Copyright 2024 Farm-credit Contributors
// Licensed under the Apache License, Version 2.0

/**
 * Tree Sponsorship Comparison Domain Layer
 *
 * Feature: Allow sponsors to compare the tree sponsorship offering across
 * different projects on a structured data table (cost, species, CO2, survival rate, location).
 *
 * Acceptance Criteria:
 * - Compare up to four projects simultaneously
 * - Table sortable by each metric
 * - Link to full project page from each column
 */

export interface TreeSponsorshipOffering {
  /** Unique project identifier matching catalogue (e.g. 'proj-001') */
  id: string;
  projectId: string;
  projectName: string;
  projectSlug?: string;
  /** Sponsorship cost per tree in USD */
  cost: number;
  currency: string;
  /** Primary tree species planted */
  species: string;
  /** Additional tree species included in the project mix */
  secondarySpecies?: string[];
  /** Annual CO2 sequestered per tree in kg */
  co2: number;
  co2Unit: string;
  /** 6-month oracle-verified tree survival rate percentage (0–100) */
  survivalRate: number;
  /** Project location / region */
  location: string;
  country: string;
  description: string;
  projectType: string;
  imageUrl?: string;
  isAvailable: boolean;
}

export type SponsorshipMetricId = 'cost' | 'species' | 'co2' | 'survivalRate' | 'location';

export type SortDirection = 'asc' | 'desc';

export interface SponsorshipMetricMeta {
  id: SponsorshipMetricId;
  label: string;
  shortLabel: string;
  description: string;
  unit?: string;
  isNumeric: boolean;
}

export const MAX_COMPARE_PROJECTS = 4;
export const MIN_COMPARE_PROJECTS = 1;

export const SPONSORSHIP_METRICS: readonly SponsorshipMetricMeta[] = [
  {
    id: 'cost',
    label: 'Cost per Tree',
    shortLabel: 'Cost',
    description: 'Sponsorship contribution cost per individual tree',
    unit: 'USD',
    isNumeric: true,
  },
  {
    id: 'species',
    label: 'Tree Species',
    shortLabel: 'Species',
    description: 'Native tree species planted and maintained by the project',
    isNumeric: false,
  },
  {
    id: 'co2',
    label: 'CO₂ Sequestration',
    shortLabel: 'CO₂',
    description: 'Estimated carbon dioxide absorption per tree per year',
    unit: 'kg CO₂/yr',
    isNumeric: true,
  },
  {
    id: 'survivalRate',
    label: 'Survival Rate',
    shortLabel: 'Survival Rate',
    description: '6-month oracle-verified tree survival rate percentage',
    unit: '%',
    isNumeric: true,
  },
  {
    id: 'location',
    label: 'Project Location',
    shortLabel: 'Location',
    description: 'Geographic planting site and region',
    isNumeric: false,
  },
] as const;

export const MOCK_TREE_SPONSORSHIP_OFFERINGS: TreeSponsorshipOffering[] = [
  {
    id: 'proj-001',
    projectId: 'proj-001',
    projectName: 'Amazon Rainforest Reforestation',
    projectSlug: 'amazon-rainforest-reforestation',
    cost: 18.5,
    currency: 'USD',
    species: 'Teak (Tectona grandis)',
    secondarySpecies: ['Brazilian Nut', 'Rosewood', 'Acai Palm'],
    co2: 22,
    co2Unit: 'kg CO₂/yr',
    survivalRate: 91,
    location: 'Amazon Basin, Brazil',
    country: 'Brazil',
    description:
      'High-density native canopy restoration across degraded agricultural parcels in Pará state.',
    projectType: 'Reforestation',
    imageUrl:
      'https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?auto=format&fit=crop&q=80&w=600',
    isAvailable: true,
  },
  {
    id: 'proj-004',
    projectId: 'proj-004',
    projectName: 'Mangrove Restoration - Indonesia',
    projectSlug: 'mangrove-restoration-indonesia',
    cost: 12.0,
    currency: 'USD',
    species: 'Red Mangrove (Rhizophora mangle)',
    secondarySpecies: ['Black Mangrove', 'White Mangrove'],
    co2: 14,
    co2Unit: 'kg CO₂/yr',
    survivalRate: 84,
    location: 'Coastal Regions, Indonesia',
    country: 'Indonesia',
    description:
      'Tidal mangrove barrier replanting protecting vulnerable fishing villages from storm surges.',
    projectType: 'Mangrove Restoration',
    imageUrl:
      'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&q=80&w=600',
    isAvailable: true,
  },
  {
    id: 'proj-005',
    projectId: 'proj-005',
    projectName: 'Sustainable Agriculture - Kenya',
    projectSlug: 'sustainable-agriculture-kenya',
    cost: 9.5,
    currency: 'USD',
    species: 'Moringa (Moringa oleifera)',
    secondarySpecies: ['Neem', 'Grevillea'],
    co2: 9,
    co2Unit: 'kg CO₂/yr',
    survivalRate: 78,
    location: 'Kenya, East Africa',
    country: 'Kenya',
    description:
      'Agroforestry boundary plantings enhancing food security, bee fodder, and soil nutrients for smallholders.',
    projectType: 'Sustainable Agriculture',
    imageUrl:
      'https://images.unsplash.com/photo-1500937386664-56d1dfef3854?auto=format&fit=crop&q=80&w=600',
    isAvailable: true,
  },
  {
    id: 'proj-006',
    projectId: 'proj-006',
    projectName: 'Great Green Wall Agroforestry - Senegal',
    projectSlug: 'great-green-wall-senegal',
    cost: 13.0,
    currency: 'USD',
    species: 'Acacia (Acacia senegal)',
    secondarySpecies: ['Baobab', 'Desert Date'],
    co2: 11,
    co2Unit: 'kg CO₂/yr',
    survivalRate: 82,
    location: 'Sahel Region, Senegal',
    country: 'Senegal',
    description:
      'Drought-hardy gum acacia shelterbelts halting Sahara desertification and generating gum arabic livelihoods.',
    projectType: 'Reforestation',
    imageUrl:
      'https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&q=80&w=600',
    isAvailable: true,
  },
  {
    id: 'proj-007',
    projectId: 'proj-007',
    projectName: 'Boreal Peatland Rewetting - Canada',
    projectSlug: 'boreal-peatland-canada',
    cost: 22.0,
    currency: 'USD',
    species: 'Black Spruce (Picea mariana)',
    secondarySpecies: ['Tamarack Larch', 'Balsam Fir'],
    co2: 19,
    co2Unit: 'kg CO₂/yr',
    survivalRate: 94,
    location: 'Ontario, Canada',
    country: 'Canada',
    description:
      'Native conifer establishment over restored sub-arctic peatland buffers with exceptional long-term retention.',
    projectType: 'Reforestation',
    imageUrl:
      'https://images.unsplash.com/photo-1473448912268-2022ce9509d8?auto=format&fit=crop&q=80&w=600',
    isAvailable: true,
  },
  {
    id: 'proj-009',
    projectId: 'proj-009',
    projectName: 'Northern Nigeria Savannah Agro-Forestry',
    projectSlug: 'northern-nigeria-savannah',
    cost: 8.0,
    currency: 'USD',
    species: 'Shea Tree (Vitellaria paradoxa)',
    secondarySpecies: ['Acacia', 'Locust Bean'],
    co2: 12,
    co2Unit: 'kg CO₂/yr',
    survivalRate: 87,
    location: 'Kaduna, Nigeria',
    country: 'Nigeria',
    description:
      'Wild shea and acacia parkland rehabilitation managed directly by women-led agricultural cooperatives.',
    projectType: 'Sustainable Agriculture',
    imageUrl:
      'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&q=80&w=600',
    isAvailable: true,
  },
  {
    id: 'proj-012',
    projectId: 'proj-012',
    projectName: 'Sundarbans Mangrove Protection - Bangladesh',
    projectSlug: 'sundarbans-mangrove-protection',
    cost: 16.0,
    currency: 'USD',
    species: 'Sundari (Heritiera fomes)',
    secondarySpecies: ['Gewa', 'Keora'],
    co2: 16,
    co2Unit: 'kg CO₂/yr',
    survivalRate: 89,
    location: 'Khulna, Bangladesh',
    country: 'Bangladesh',
    description:
      'Deep delta mangrove belt expansion shielding Bengal tiger habitats and fragile shoreline ecosystems.',
    projectType: 'Mangrove Restoration',
    imageUrl:
      'https://images.unsplash.com/photo-1511497584788-87676104235f?auto=format&fit=crop&q=80&w=600',
    isAvailable: true,
  },
  {
    id: 'proj-013',
    projectId: 'proj-013',
    projectName: 'Andean Cloud Forest Restoration - Peru',
    projectSlug: 'andean-cloud-forest-peru',
    cost: 21.0,
    currency: 'USD',
    species: 'Queñua (Polylepis incana)',
    secondarySpecies: ['Chachacomo', 'Aliso'],
    co2: 17,
    co2Unit: 'kg CO₂/yr',
    survivalRate: 86,
    location: 'Cusco, Peru',
    country: 'Peru',
    description:
      'High-altitude Polylepis cloud forest re-establishment protecting glacial headwaters above the Sacred Valley.',
    projectType: 'Reforestation',
    imageUrl:
      'https://images.unsplash.com/photo-1426604966848-d7adac402bff?auto=format&fit=crop&q=80&w=600',
    isAvailable: true,
  },
];

/** Return all available tree sponsorship offerings. */
export function getAllTreeSponsorshipOfferings(): TreeSponsorshipOffering[] {
  return [...MOCK_TREE_SPONSORSHIP_OFFERINGS];
}

/** Retrieve an individual tree sponsorship offering by project ID or slug. */
export function getTreeSponsorshipOfferingById(
  idOrSlug: string
): TreeSponsorshipOffering | undefined {
  const normalized = idOrSlug.trim().toLowerCase();
  return MOCK_TREE_SPONSORSHIP_OFFERINGS.find(
    (item) =>
      item.id.toLowerCase() === normalized ||
      item.projectId.toLowerCase() === normalized ||
      (item.projectSlug && item.projectSlug.toLowerCase() === normalized)
  );
}

/**
 * Normalises a selection of project ids, capping at MAX_COMPARE_PROJECTS (4).
 * Drops empty and duplicate entries.
 */
export function normalizeSponsorshipProjectIds(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const id of ids) {
    const trimmed = id.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    normalized.push(trimmed);
    if (normalized.length === MAX_COMPARE_PROJECTS) break;
  }

  return normalized;
}

/** Extracts the numeric or string sort key for an offering and metric. */
export function getOfferingMetricValue(
  offering: TreeSponsorshipOffering,
  metric: SponsorshipMetricId
): number | string {
  switch (metric) {
    case 'cost':
      return offering.cost;
    case 'species':
      return offering.species.toLowerCase();
    case 'co2':
      return offering.co2;
    case 'survivalRate':
      return offering.survivalRate;
    case 'location':
      return offering.location.toLowerCase();
  }
}

/**
 * Sorts an array of offerings by the selected metric and direction.
 * Stable sort preserving source order on equality.
 */
export function sortSponsorshipOfferings(
  offerings: readonly TreeSponsorshipOffering[],
  metric: SponsorshipMetricId,
  direction: SortDirection = 'asc'
): TreeSponsorshipOffering[] {
  const cloned = [...offerings];

  cloned.sort((a, b) => {
    const valA = getOfferingMetricValue(a, metric);
    const valB = getOfferingMetricValue(b, metric);

    let comparison = 0;
    if (typeof valA === 'number' && typeof valB === 'number') {
      comparison = valA - valB;
    } else {
      comparison = String(valA).localeCompare(String(valB));
    }

    return direction === 'asc' ? comparison : -comparison;
  });

  return cloned;
}

/** Format metric value into a readable string for the data table. */
export function formatSponsorshipMetric(
  offering: TreeSponsorshipOffering,
  metric: SponsorshipMetricId
): string {
  switch (metric) {
    case 'cost':
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: offering.currency || 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(offering.cost);
    case 'species':
      return offering.species;
    case 'co2':
      return `${offering.co2} ${offering.co2Unit}`;
    case 'survivalRate':
      return `${offering.survivalRate}%`;
    case 'location':
      return offering.location;
  }
}

/** Default initial selection (first 3-4 projects) for immediate comparison */
export const DEFAULT_SPONSORSHIP_COMPARE_IDS: readonly string[] = [
  'proj-001',
  'proj-004',
  'proj-006',
  'proj-009',
];
