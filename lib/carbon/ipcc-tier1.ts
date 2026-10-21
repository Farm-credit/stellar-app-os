/**
 * CO₂ sequestration estimates using an IPCC Tier 1 approach (#1699).
 *
 * Method (per tree, at age `a` years):
 *
 *   1. Size at age — Chapman–Richards style curves, scaled by the climate
 *      zone growth factor: D(a) = Dmax · (1 − e^(−k·a_eff))², H(a) = Hmax · (1 − e^(−k·a_eff)),
 *      with k = 3 / maturityYears and a_eff = a × zoneGrowthFactor.
 *   2. Above-ground biomass (kg) — Chave et al. (2014) pantropical allometric
 *      equation (Eq. 4): AGB = 0.0673 · (ρ · D² · H)^0.976,
 *      with ρ the species wood density (g/cm³), D diameter at breast height (cm)
 *      and H height (m).
 *   3. Total biomass — AGB · (1 + R), with R the IPCC root-to-shoot ratio for the zone.
 *   4. Carbon — total biomass · CF, with the IPCC default carbon fraction CF = 0.47.
 *   5. CO₂ — carbon · 44/12.
 *
 * Species dimensions are conservative smallholder-plantation values chosen so the
 * average annual rate over each species' maturity period reconciles with the
 * per-species rates already published by the platform (`TREE_SPECIES`). Wood
 * densities follow the Global Wood Density Database; root-to-shoot ratios and the
 * carbon fraction follow IPCC (2006) Guidelines, Vol. 4, Ch. 4 default values.
 * All of them are plain constants below and are shown on the methodology page.
 */
import { CLIMATE_FACTORS, TREE_SPECIES, type ClimateZone } from '@/lib/constants/species';
import type { TreeSpecies } from '@/lib/types/tree';

/** IPCC default carbon fraction of dry biomass. */
export const CARBON_FRACTION = 0.47;
/** Molecular weight ratio CO₂ / C. */
export const CO2_PER_CARBON = 44 / 12;

/** Chave et al. (2014) pantropical equation coefficients: AGB = a · (ρD²H)^b. */
export const CHAVE_2014 = { a: 0.0673, b: 0.976 } as const;

/** Root-to-shoot ratio (below-ground / above-ground biomass) by climate zone. */
export const ROOT_TO_SHOOT_RATIO: Record<ClimateZone, number> = {
  tropical: 0.24,
  subtropical: 0.24,
  temperate: 0.23,
  arid: 0.28,
  coastal: 0.39,
};

export interface SpeciesAllometry {
  /** Basic wood density, g/cm³. */
  woodDensity: number;
  /** Mature (asymptotic) diameter at breast height, cm. */
  dbhMaxCm: number;
  /** Mature (asymptotic) height, m. */
  heightMaxM: number;
}

/** Allometric inputs per species, keyed by the species slug in `TREE_SPECIES`. */
export const SPECIES_ALLOMETRY: Record<string, SpeciesAllometry> = {
  teak: { woodDensity: 0.55, dbhMaxCm: 22, heightMaxM: 18 },
  moringa: { woodDensity: 0.25, dbhMaxCm: 13, heightMaxM: 6.5 },
  eucalyptus: { woodDensity: 0.6, dbhMaxCm: 18, heightMaxM: 16.5 },
  mangrove: { woodDensity: 0.75, dbhMaxCm: 18, heightMaxM: 9 },
  acacia: { woodDensity: 0.65, dbhMaxCm: 16, heightMaxM: 8 },
  neem: { woodDensity: 0.69, dbhMaxCm: 16, heightMaxM: 7.5 },
  mahogany: { woodDensity: 0.5, dbhMaxCm: 25, heightMaxM: 16 },
  baobab: { woodDensity: 0.3, dbhMaxCm: 39, heightMaxM: 9.5 },
  bamboo: { woodDensity: 0.6, dbhMaxCm: 13, heightMaxM: 19 },
  cedar: { woodDensity: 0.45, dbhMaxCm: 28, heightMaxM: 18 },
  pine: { woodDensity: 0.55, dbhMaxCm: 21, heightMaxM: 17.5 },
  iroko: { woodDensity: 0.64, dbhMaxCm: 25, heightMaxM: 15.5 },
  shea: { woodDensity: 0.7, dbhMaxCm: 19, heightMaxM: 6 },
  cashew: { woodDensity: 0.5, dbhMaxCm: 19, heightMaxM: 6 },
  locust_bean: { woodDensity: 0.6, dbhMaxCm: 25, heightMaxM: 8.5 },
};

export const CLIMATE_ZONES: ClimateZone[] = [
  'tropical',
  'subtropical',
  'temperate',
  'arid',
  'coastal',
];

/** Where the methodology is explained; every CO₂ figure links here. */
export const CO2_METHODOLOGY_PATH = '/methodologies/ipcc-tier1';

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

/** Chave et al. (2014) above-ground biomass in kg. */
export function aboveGroundBiomassKg(woodDensity: number, dbhCm: number, heightM: number): number {
  if (dbhCm <= 0 || heightM <= 0) return 0;
  return CHAVE_2014.a * Math.pow(woodDensity * dbhCm * dbhCm * heightM, CHAVE_2014.b);
}

function findSpecies(species: TreeSpecies) {
  const info = TREE_SPECIES.find((s) => s.name === species);
  const allometry = info ? SPECIES_ALLOMETRY[info.slug] : undefined;
  if (!info || !allometry) {
    throw new Error(`No IPCC Tier 1 parameters for species "${species}"`);
  }
  return { info, allometry };
}

/** Tree size (DBH cm, height m) at an age, after the climate zone growth factor. */
export function sizeAtAge(
  species: TreeSpecies,
  climateZone: ClimateZone,
  ageYears: number
): { dbhCm: number; heightM: number } {
  const { info, allometry } = findSpecies(species);
  const age = Math.max(0, ageYears);
  const k = 3 / info.maturityYears;
  const progress = 1 - Math.exp(-k * age * CLIMATE_FACTORS[climateZone]);
  return {
    dbhCm: allometry.dbhMaxCm * progress * progress,
    heightM: allometry.heightMaxM * progress,
  };
}

/** Cumulative CO₂ stored by one tree at a given age, in kg. */
export function cumulativeCo2Kg(
  species: TreeSpecies,
  climateZone: ClimateZone,
  ageYears: number
): number {
  const { allometry } = findSpecies(species);
  const { dbhCm, heightM } = sizeAtAge(species, climateZone, ageYears);
  const agb = aboveGroundBiomassKg(allometry.woodDensity, dbhCm, heightM);
  const totalBiomass = agb * (1 + ROOT_TO_SHOOT_RATIO[climateZone]);
  return totalBiomass * CARBON_FRACTION * CO2_PER_CARBON;
}

/** CO₂ the tree is expected to add over the next 12 months from this age, in kg. */
export function annualSequestrationKg(
  species: TreeSpecies,
  climateZone: ClimateZone,
  ageYears: number
): number {
  const age = Math.max(0, ageYears);
  return (
    cumulativeCo2Kg(species, climateZone, age + 1) - cumulativeCo2Kg(species, climateZone, age)
  );
}

/**
 * Climate zone used when a tree record does not set one: mangroves are
 * `coastal`, otherwise it follows absolute latitude (tropics ≤ 23.5°,
 * subtropics ≤ 35°, temperate beyond).
 */
export function inferClimateZone(species: TreeSpecies, latitude: number): ClimateZone {
  if (species === 'Mangrove') return 'coastal';
  const lat = Math.abs(latitude);
  if (lat <= 23.5) return 'tropical';
  if (lat <= 35) return 'subtropical';
  return 'temperate';
}

export interface TreeSequestrationInput {
  species: TreeSpecies;
  climateZone: ClimateZone;
  /** ISO date the tree was planted; unplanted trees are treated as age 0. */
  plantedAt?: string | Date | null;
  /** Evaluation date; defaults to now. Pass it for deterministic output. */
  asOf?: Date;
}

export interface TreeSequestration {
  inputs: {
    species: TreeSpecies;
    climateZone: ClimateZone;
    ageYears: number;
    plantedAt: string | null;
  };
  parameters: SpeciesAllometry & {
    maturityYears: number;
    rootToShootRatio: number;
    zoneGrowthFactor: number;
    carbonFraction: number;
  };
  size: { dbhCm: number; heightM: number };
  /** CO₂ stored to date, kg. */
  cumulativeCo2Kg: number;
  /** CO₂ expected over the next 12 months, kg. Rises and falls as the tree ages. */
  annualCo2Kg: number;
}

export function estimateTreeSequestration(input: TreeSequestrationInput): TreeSequestration {
  const { info, allometry } = findSpecies(input.species);
  const asOf = input.asOf ?? new Date();
  const planted = input.plantedAt ? new Date(input.plantedAt) : null;
  const validPlanted = planted && !Number.isNaN(planted.getTime()) ? planted : null;
  const ageYears = validPlanted
    ? Math.max(0, (asOf.getTime() - validPlanted.getTime()) / MS_PER_YEAR)
    : 0;

  return {
    inputs: {
      species: input.species,
      climateZone: input.climateZone,
      ageYears,
      plantedAt: validPlanted ? validPlanted.toISOString() : null,
    },
    parameters: {
      ...allometry,
      maturityYears: info.maturityYears,
      rootToShootRatio: ROOT_TO_SHOOT_RATIO[input.climateZone],
      zoneGrowthFactor: CLIMATE_FACTORS[input.climateZone],
      carbonFraction: CARBON_FRACTION,
    },
    size: sizeAtAge(input.species, input.climateZone, ageYears),
    cumulativeCo2Kg: cumulativeCo2Kg(input.species, input.climateZone, ageYears),
    annualCo2Kg: annualSequestrationKg(input.species, input.climateZone, ageYears),
  };
}
