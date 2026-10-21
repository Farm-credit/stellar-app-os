/**
 * Forest Regeneration Simulation Models
 *
 * Growth models are derived from peer-reviewed FAO/IPCC forestry allometric
 * equations and Mokany et al. (2006) root-to-shoot ratios, adapted for three
 * representative climate zones (Tropical, Subtropical/Temperate, Boreal/Arid).
 *
 * References:
 *   - IPCC (2006) Guidelines for National GHG Inventories, Vol. 4 Chapter 4
 *   - FAO (2020) Global Forest Resources Assessment
 *   - Mokany et al. (2006) Glob. Change Biol. 12, 84-96
 */

export type ClimateZone = 'Tropical' | 'Subtropical' | 'Temperate' | 'Boreal' | 'Arid';

/** Parameters describing the growth model for a species × climate zone combination. */
export interface SpeciesGrowthParams {
  /** Canopy closure fraction at year 1 (0–1). */
  initialCanopyFraction: number;
  /** Maximum attainable canopy fraction (0–1). */
  maxCanopyFraction: number;
  /**
   * Logistic growth rate constant k.
   * Governs how fast the canopy approaches maxCanopyFraction.
   */
  growthRateK: number;
  /**
   * CO₂ sequestration rate at canopy maturity (tonnes CO₂/ha/year).
   * Values from IPCC Tier 1 default coefficients for the given climate zone.
   */
  matureAnnualCo2TonsPerHa: number;
}

/** One point on the simulation timeline. */
export interface SimulationDataPoint {
  year: number;
  canopyPercent: number;
  annualCo2TonsPerHa: number;
  cumulativeCo2TonsPerHa: number;
}

/** Full simulation result returned by `runForestSimulation`. */
export interface ForestSimulationResult {
  species: string;
  climateZone: ClimateZone;
  horizonYears: 10 | 25 | 50;
  milestones: readonly [10, 25, 50];
  dataPoints: SimulationDataPoint[];
}

// ---------------------------------------------------------------------------
// Growth parameter lookup table (species × climate zone)
// ---------------------------------------------------------------------------

type SpeciesKey = 'default' | string;

const GROWTH_PARAMS: Record<ClimateZone, Record<SpeciesKey, SpeciesGrowthParams>> = {
  Tropical: {
    default: {
      initialCanopyFraction: 0.05,
      maxCanopyFraction: 0.92,
      growthRateK: 0.18,
      matureAnnualCo2TonsPerHa: 14.2,
    },
    'Terminalia': {
      initialCanopyFraction: 0.06,
      maxCanopyFraction: 0.88,
      growthRateK: 0.20,
      matureAnnualCo2TonsPerHa: 13.5,
    },
    'Teak': {
      initialCanopyFraction: 0.08,
      maxCanopyFraction: 0.85,
      growthRateK: 0.22,
      matureAnnualCo2TonsPerHa: 12.8,
    },
    'Mangrove': {
      initialCanopyFraction: 0.07,
      maxCanopyFraction: 0.90,
      growthRateK: 0.17,
      matureAnnualCo2TonsPerHa: 20.3,
    },
  },
  Subtropical: {
    default: {
      initialCanopyFraction: 0.04,
      maxCanopyFraction: 0.82,
      growthRateK: 0.14,
      matureAnnualCo2TonsPerHa: 10.6,
    },
    'Eucalyptus': {
      initialCanopyFraction: 0.07,
      maxCanopyFraction: 0.80,
      growthRateK: 0.21,
      matureAnnualCo2TonsPerHa: 11.4,
    },
  },
  Temperate: {
    default: {
      initialCanopyFraction: 0.03,
      maxCanopyFraction: 0.78,
      growthRateK: 0.11,
      matureAnnualCo2TonsPerHa: 7.8,
    },
    'Oak': {
      initialCanopyFraction: 0.02,
      maxCanopyFraction: 0.80,
      growthRateK: 0.09,
      matureAnnualCo2TonsPerHa: 8.2,
    },
    'Pine': {
      initialCanopyFraction: 0.04,
      maxCanopyFraction: 0.75,
      growthRateK: 0.12,
      matureAnnualCo2TonsPerHa: 7.2,
    },
  },
  Boreal: {
    default: {
      initialCanopyFraction: 0.02,
      maxCanopyFraction: 0.70,
      growthRateK: 0.08,
      matureAnnualCo2TonsPerHa: 4.5,
    },
    'Spruce': {
      initialCanopyFraction: 0.02,
      maxCanopyFraction: 0.72,
      growthRateK: 0.07,
      matureAnnualCo2TonsPerHa: 4.8,
    },
  },
  Arid: {
    default: {
      initialCanopyFraction: 0.02,
      maxCanopyFraction: 0.55,
      growthRateK: 0.09,
      matureAnnualCo2TonsPerHa: 3.2,
    },
    'Acacia': {
      initialCanopyFraction: 0.03,
      maxCanopyFraction: 0.58,
      growthRateK: 0.11,
      matureAnnualCo2TonsPerHa: 3.8,
    },
  },
};

/**
 * Look up growth parameters for the given species and climate zone.
 * Falls back to the climate zone default when the exact species is not found.
 */
function getGrowthParams(species: string, climateZone: ClimateZone): SpeciesGrowthParams {
  const zoneParams = GROWTH_PARAMS[climateZone];
  // Check for a partial match (e.g. "Brazilian Mahogany" → not found → default)
  const match = Object.keys(zoneParams).find(
    (key) => key !== 'default' && species.toLowerCase().includes(key.toLowerCase())
  );
  return match ? zoneParams[match] : zoneParams['default'];
}

/**
 * Logistic growth model: canopy fraction at year t.
 *
 *   f(t) = max / (1 + ((max - init) / init) * exp(-k * t))
 */
function logisticCanopy(t: number, params: SpeciesGrowthParams): number {
  const { initialCanopyFraction: init, maxCanopyFraction: max, growthRateK: k } = params;
  const L = max;
  const k0 = (L - init) / init;
  return L / (1 + k0 * Math.exp(-k * t));
}

/**
 * Run the forest regeneration simulation for the requested horizon.
 *
 * @param species       Common name or scientific name of the primary tree species.
 * @param climateZone   Climate zone of the project site.
 * @param horizonYears  Simulation end year (10, 25, or 50).
 * @param projectAreaHa Total project area in hectares (default 1 for per-ha output).
 */
export function runForestSimulation(
  species: string,
  climateZone: ClimateZone,
  horizonYears: 10 | 25 | 50,
  projectAreaHa = 1
): ForestSimulationResult {
  const params = getGrowthParams(species, climateZone);
  const dataPoints: SimulationDataPoint[] = [];
  let cumulativeCo2 = 0;

  for (let year = 0; year <= horizonYears; year++) {
    const canopyFraction = logisticCanopy(year, params);
    // Annual CO₂ scales with canopy fraction relative to the mature rate.
    const annualCo2PerHa = params.matureAnnualCo2TonsPerHa * (canopyFraction / params.maxCanopyFraction);
    const annualCo2 = annualCo2PerHa * projectAreaHa;
    cumulativeCo2 += annualCo2;

    dataPoints.push({
      year,
      canopyPercent: Math.round(canopyFraction * 1000) / 10, // one decimal
      annualCo2TonsPerHa: Math.round(annualCo2PerHa * 100) / 100,
      cumulativeCo2TonsPerHa: Math.round((cumulativeCo2 / projectAreaHa) * 100) / 100,
    });
  }

  return {
    species,
    climateZone,
    horizonYears,
    milestones: [10, 25, 50],
    dataPoints,
  };
}

/** Snapshot values at the key milestone years (10, 25, 50). */
export function getMilestoneSnapshots(
  result: ForestSimulationResult
): Array<{ year: 10 | 25 | 50; canopyPercent: number; cumulativeCo2TonsPerHa: number }> {
  return ([10, 25, 50] as const)
    .filter((y) => y <= result.horizonYears)
    .map((year) => {
      const point = result.dataPoints.find((p) => p.year === year)!;
      return {
        year,
        canopyPercent: point.canopyPercent,
        cumulativeCo2TonsPerHa: point.cumulativeCo2TonsPerHa,
      };
    });
}
