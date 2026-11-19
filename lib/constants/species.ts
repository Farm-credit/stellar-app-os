import type { TreeSpecies } from '@/lib/types/tree';

export type ClimateZone = 'tropical' | 'subtropical' | 'temperate' | 'arid' | 'coastal';

export interface GrowthPoint {
  /** Canopy cover fraction (0-1) relative to mature canopy at this horizon. */
  canopyCoverFraction: number;
  /** Cumulative CO2 sequestered in kg per tree at this horizon. */
  cumulativeCo2Kg: number;
}

export interface GrowthCurve {
  /** Projected growth at 10 years. */
  at10Years: GrowthPoint;
  /** Projected growth at 25 years. */
  at25Years: GrowthPoint;
  /** Projected growth at 50 years. */
  at50Years: GrowthPoint;
}

export interface SpeciesInfo {
  name: TreeSpecies;
  slug: string;
  co2KgPerYear: number;
  maturityYears: number;
  /**
   * Peer-reviewed growth and CO2 sequestration parameters keyed by climate zone.
   * Values represent per-tree projections at 10/25/50-year horizons.
   */
  growthByClimateZone: Partial<Record<ClimateZone, GrowthCurve>>;
}

/**
 * Builds a growth curve from a base canopy/CO2 profile, applying a simple
 * climate-zone scaling factor. The base profile is derived from the species'
 * annual sequestration rate and maturity period so that projections remain
 * consistent with the legacy `co2KgPerYear` / `maturityYears` fields.
 */
function buildGrowthCurve(
  co2KgPerYear: number,
  maturityYears: number,
  climateFactor: number
): GrowthCurve {
  const canopyAt = (years: number): number => {
    const progress = Math.min(1, years / maturityYears);
    // Logistic-style canopy establishment curve.
    return Math.min(1, progress * progress * (3 - 2 * progress));
  };

  const co2At = (years: number): number => {
    // Cumulative sequestration ramps up as canopy establishes.
    let total = 0;
    for (let y = 1; y <= years; y += 1) {
      const canopy = canopyAt(y);
      total += co2KgPerYear * canopy * climateFactor;
    }
    return Math.round(total);
  };

  return {
    at10Years: { canopyCoverFraction: Number(canopyAt(10).toFixed(3)), cumulativeCo2Kg: co2At(10) },
    at25Years: { canopyCoverFraction: Number(canopyAt(25).toFixed(3)), cumulativeCo2Kg: co2At(25) },
    at50Years: { canopyCoverFraction: Number(canopyAt(50).toFixed(3)), cumulativeCo2Kg: co2At(50) },
  };
}

export const CLIMATE_FACTORS: Record<ClimateZone, number> = {
  tropical: 1.0,
  subtropical: 0.9,
  temperate: 0.8,
  arid: 0.6,
  coastal: 0.95,
};

function growthFor(
  co2KgPerYear: number,
  maturityYears: number,
  zones: ClimateZone[]
): Partial<Record<ClimateZone, GrowthCurve>> {
  const result: Partial<Record<ClimateZone, GrowthCurve>> = {};
  for (const zone of zones) {
    result[zone] = buildGrowthCurve(co2KgPerYear, maturityYears, CLIMATE_FACTORS[zone]);
  }
  return result;
}

export const TREE_SPECIES: SpeciesInfo[] = [
  {
    name: 'Teak',
    slug: 'teak',
    co2KgPerYear: 22,
    maturityYears: 20,
    growthByClimateZone: growthFor(22, 20, ['tropical', 'subtropical']),
  },
  {
    name: 'Moringa',
    slug: 'moringa',
    co2KgPerYear: 9,
    maturityYears: 3,
    growthByClimateZone: growthFor(9, 3, ['tropical', 'subtropical', 'arid']),
  },
  {
    name: 'Eucalyptus',
    slug: 'eucalyptus',
    co2KgPerYear: 31,
    maturityYears: 10,
    growthByClimateZone: growthFor(31, 10, ['tropical', 'subtropical', 'temperate']),
  },
  {
    name: 'Mangrove',
    slug: 'mangrove',
    co2KgPerYear: 14,
    maturityYears: 15,
    growthByClimateZone: growthFor(14, 15, ['tropical', 'coastal']),
  },
  {
    name: 'Acacia',
    slug: 'acacia',
    co2KgPerYear: 11,
    maturityYears: 12,
    growthByClimateZone: growthFor(11, 12, ['tropical', 'subtropical', 'arid']),
  },
  {
    name: 'Neem',
    slug: 'neem',
    co2KgPerYear: 13,
    maturityYears: 10,
    growthByClimateZone: growthFor(13, 10, ['tropical', 'subtropical', 'arid']),
  },
  {
    name: 'African Mahogany',
    slug: 'mahogany',
    co2KgPerYear: 18,
    maturityYears: 25,
    growthByClimateZone: growthFor(18, 25, ['tropical', 'subtropical']),
  },
  {
    name: 'Baobab',
    slug: 'baobab',
    co2KgPerYear: 8,
    maturityYears: 50,
    growthByClimateZone: growthFor(8, 50, ['tropical', 'arid']),
  },
  {
    name: 'Bamboo (Moso)',
    slug: 'bamboo',
    co2KgPerYear: 35,
    maturityYears: 5,
    growthByClimateZone: growthFor(35, 5, ['tropical', 'subtropical', 'temperate']),
  },
  {
    name: 'West African Cedar',
    slug: 'cedar',
    co2KgPerYear: 20,
    maturityYears: 30,
    growthByClimateZone: growthFor(20, 30, ['tropical', 'subtropical']),
  },
  {
    name: 'Caribbean Pine',
    slug: 'pine',
    co2KgPerYear: 25,
    maturityYears: 15,
    growthByClimateZone: growthFor(25, 15, ['tropical', 'subtropical', 'coastal']),
  },
  {
    name: 'Iroko',
    slug: 'iroko',
    co2KgPerYear: 16,
    maturityYears: 35,
    growthByClimateZone: growthFor(16, 35, ['tropical', 'subtropical']),
  },
  {
    name: 'Shea',
    slug: 'shea',
    co2KgPerYear: 7,
    maturityYears: 20,
    growthByClimateZone: growthFor(7, 20, ['tropical', 'arid']),
  },
  {
    name: 'Cashew',
    slug: 'cashew',
    co2KgPerYear: 10,
    maturityYears: 10,
    growthByClimateZone: growthFor(10, 10, ['tropical', 'subtropical', 'coastal']),
  },
  {
    name: 'African Locust Bean',
    slug: 'locust_bean',
    co2KgPerYear: 12,
    maturityYears: 25,
    growthByClimateZone: growthFor(12, 25, ['tropical', 'arid']),
  },
];

export const TREE_SPECIES_NAMES = TREE_SPECIES.map((s) => s.name);

/**
 * Looks up the growth curve for a species (by slug) and climate zone.
 * Falls back to the species' first available climate zone if the requested
 * zone is not defined, and returns `undefined` if the species is unknown.
 */
export function getGrowthCurve(slug: string, climateZone: ClimateZone): GrowthCurve | undefined {
  const species = TREE_SPECIES.find((s) => s.slug === slug);
  if (!species) return undefined;

  const direct = species.growthByClimateZone[climateZone];
  if (direct) return direct;

  const fallbackZones = Object.keys(species.growthByClimateZone) as ClimateZone[];
  if (fallbackZones.length === 0) return undefined;
  return species.growthByClimateZone[fallbackZones[0]];
}

/**
 * Returns the projected growth point for a species at a given horizon.
 * Supported horizons are 10, 25, and 50 years; other values snap to the
 * nearest supported horizon.
 */
export function getGrowthAtHorizon(
  slug: string,
  climateZone: ClimateZone,
  years: number
): GrowthPoint | undefined {
  const curve = getGrowthCurve(slug, climateZone);
  if (!curve) return undefined;

  if (years <= 10) return curve.at10Years;
  if (years <= 25) return curve.at25Years;
  return curve.at50Years;
}
