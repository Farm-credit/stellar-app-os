import { TREE_SPECIES } from '@/lib/constants/species';
import type { TreeSpecies } from '@/lib/types/tree';

/**
 * Deterministic tree growth model shared by the sponsor growth story
 * (Issue #1102) and the 20-year AR projection (Issue #1106).
 *
 * Everything here is a pure function of its inputs: no `Date.now()`, no
 * randomness. Server-rendered growth stories therefore stay stable across
 * builds and renders, and the same tree always shows the same numbers.
 */

/**
 * Fixed "today" for growth stories. Real photos are appended over time, but a
 * constant anchor keeps server and client renders identical.
 */
export const GROWTH_TIMELINE_ANCHOR_MS = Date.UTC(2026, 8, 1);

/** Projection horizon promised by the AR experience. */
export const TREE_MATURITY_YEARS = 20;

const MONTHS_PER_YEAR = 12;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const AVG_DAYS_PER_MONTH = 30.44;

export interface SpeciesGrowthProfile {
  species: TreeSpecies;
  /** Height at full maturity, in centimetres. */
  matureHeightCm: number;
  /** Canopy width at full maturity, in centimetres. */
  matureCanopyCm: number;
  /** Trunk diameter at full maturity, in millimetres. */
  matureTrunkMm: number;
}

export const SPECIES_GROWTH_PROFILES: Record<TreeSpecies, SpeciesGrowthProfile> = {
  Teak: { species: 'Teak', matureHeightCm: 2500, matureCanopyCm: 900, matureTrunkMm: 600 },
  Moringa: { species: 'Moringa', matureHeightCm: 1000, matureCanopyCm: 500, matureTrunkMm: 250 },
  Eucalyptus: {
    species: 'Eucalyptus',
    matureHeightCm: 3000,
    matureCanopyCm: 700,
    matureTrunkMm: 500,
  },
  Mangrove: { species: 'Mangrove', matureHeightCm: 1500, matureCanopyCm: 800, matureTrunkMm: 300 },
  Acacia: { species: 'Acacia', matureHeightCm: 1200, matureCanopyCm: 900, matureTrunkMm: 350 },
  Neem: { species: 'Neem', matureHeightCm: 1600, matureCanopyCm: 1000, matureTrunkMm: 400 },
  'African Mahogany': {
    species: 'African Mahogany',
    matureHeightCm: 2800,
    matureCanopyCm: 1000,
    matureTrunkMm: 700,
  },
  Baobab: { species: 'Baobab', matureHeightCm: 2000, matureCanopyCm: 1200, matureTrunkMm: 1000 },
  'Bamboo (Moso)': {
    species: 'Bamboo (Moso)',
    matureHeightCm: 1800,
    matureCanopyCm: 600,
    matureTrunkMm: 150,
  },
  'West African Cedar': {
    species: 'West African Cedar',
    matureHeightCm: 2600,
    matureCanopyCm: 800,
    matureTrunkMm: 650,
  },
  'Caribbean Pine': {
    species: 'Caribbean Pine',
    matureHeightCm: 2200,
    matureCanopyCm: 600,
    matureTrunkMm: 450,
  },
  Iroko: { species: 'Iroko', matureHeightCm: 3000, matureCanopyCm: 1100, matureTrunkMm: 800 },
  Shea: { species: 'Shea', matureHeightCm: 1400, matureCanopyCm: 800, matureTrunkMm: 400 },
  Cashew: { species: 'Cashew', matureHeightCm: 1200, matureCanopyCm: 800, matureTrunkMm: 350 },
  'African Locust Bean': {
    species: 'African Locust Bean',
    matureHeightCm: 1800,
    matureCanopyCm: 900,
    matureTrunkMm: 500,
  },
};

function maturityYearsFor(species: TreeSpecies): number {
  return TREE_SPECIES.find((entry) => entry.name === species)?.maturityYears ?? TREE_MATURITY_YEARS;
}

function matureCo2KgPerYear(species: TreeSpecies): number {
  return TREE_SPECIES.find((entry) => entry.name === species)?.co2KgPerYear ?? 20;
}

/**
 * Deterministic hash of a seed string to a unit interval value. Used to give
 * each tree a stable "personality" (slightly faster or slower growth) without
 * introducing randomness.
 */
export function hashToUnit(seed: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 10_000) / 10_000;
}

/**
 * Saturating growth curve: 50% of mature size at `halfLifeYears`, tapering
 * towards 100% thereafter. Trees never shrink, and the curve is monotonic.
 */
function saturating(matureValue: number, ageYears: number, halfLifeYears: number): number {
  if (ageYears <= 0) return 0;
  const halfLife = Math.max(halfLifeYears, 0.25);
  return matureValue * (1 - Math.pow(2, -ageYears / halfLife));
}

/** Annual CO₂ uptake at a given age — young trees sequester less. */
function annualCo2Kg(species: TreeSpecies, ageYears: number): number {
  const matureRate = matureCo2KgPerYear(species);
  const halfLife = Math.max(maturityYearsFor(species) / 3, 1);
  return matureRate * (1 - Math.pow(2, -Math.max(ageYears, 0) / halfLife));
}

export interface GrowthSnapshot {
  /** Whole years since planting (fractional age floored for display). */
  ageYears: number;
  heightCm: number;
  canopyCm: number;
  trunkMm: number;
  /** CO₂ absorbed over the last 12 months, in kilograms. */
  annualCo2Kg: number;
  /** Total CO₂ absorbed since planting, in kilograms. */
  cumulativeCo2Kg: number;
  /** Share of the 20-year projection already reached, 0–1. */
  maturityProgress: number;
}

/**
 * Growth snapshot for an exact age in years. Cumulative CO₂ is integrated at
 * monthly resolution so it always matches the monthly story series.
 */
export function growthAtYear(species: TreeSpecies, ageYears: number): GrowthSnapshot {
  const profile = SPECIES_GROWTH_PROFILES[species];
  const maturityYears = maturityYearsFor(species);
  const age = Math.max(ageYears, 0);
  const cappedAge = Math.min(age, TREE_MATURITY_YEARS);

  const jitter = 1 + (hashToUnit(`${species}:${maturityYears}`) - 0.5) * 0.08;
  const heightCm = saturating(profile.matureHeightCm * jitter, cappedAge, maturityYears / 4);
  const canopyCm = saturating(profile.matureCanopyCm * jitter, cappedAge, maturityYears / 3.2);
  const trunkMm = saturating(profile.matureTrunkMm, cappedAge, maturityYears / 5);

  const months = Math.round(cappedAge * MONTHS_PER_YEAR);
  let cumulativeCo2Kg = 0;
  for (let month = 1; month <= months; month += 1) {
    cumulativeCo2Kg += annualCo2Kg(species, month / MONTHS_PER_YEAR) / MONTHS_PER_YEAR;
  }

  return {
    ageYears: age,
    heightCm: Math.round(heightCm),
    canopyCm: Math.round(canopyCm),
    trunkMm: Math.round(trunkMm),
    annualCo2Kg: Math.round(annualCo2Kg(species, age) * 10) / 10,
    cumulativeCo2Kg: Math.round(cumulativeCo2Kg * 10) / 10,
    maturityProgress: Math.min(cappedAge / TREE_MATURITY_YEARS, 1),
  };
}

export interface MonthlyGrowthPoint {
  /** Months elapsed since planting (0 = planted month). */
  monthIndex: number;
  capturedAtMs: number;
  /** Completed years since planting at this point. */
  year: number;
  monthOfYear: number;
  heightCm: number;
  canopyCm: number;
  trunkMm: number;
  annualCo2Kg: number;
  cumulativeCo2Kg: number;
}

/**
 * Monthly growth series from planting up to `throughMs` (anchored by default).
 * Capped at the 20-year projection horizon so a story can never run past the
 * maturity model.
 */
export function buildMonthlyGrowthSeries(
  species: TreeSpecies,
  plantedAtMs: number,
  seed: string,
  throughMs: number = GROWTH_TIMELINE_ANCHOR_MS
): MonthlyGrowthPoint[] {
  if (!Number.isFinite(plantedAtMs) || throughMs <= plantedAtMs) return [];

  const totalMonths = Math.min(
    Math.floor((throughMs - plantedAtMs) / (AVG_DAYS_PER_MONTH * MS_PER_DAY)),
    TREE_MATURITY_YEARS * MONTHS_PER_YEAR
  );

  const points: MonthlyGrowthPoint[] = [];
  // Growth varies slightly per tree so two trees of a species are not clones.
  const growthBias = 0.94 + hashToUnit(seed) * 0.12;

  let cumulativeCo2Kg = 0;

  for (let monthIndex = 0; monthIndex <= totalMonths; monthIndex += 1) {
    const ageYears = monthIndex / MONTHS_PER_YEAR;
    const snapshot = growthAtYear(species, ageYears);
    const wobble = 0.97 + hashToUnit(`${seed}:${monthIndex}`) * 0.06;

    const monthAnnualCo2 = snapshot.annualCo2Kg / MONTHS_PER_YEAR;
    if (monthIndex > 0) cumulativeCo2Kg += monthAnnualCo2;

    points.push({
      monthIndex,
      capturedAtMs: plantedAtMs + Math.round(monthIndex * AVG_DAYS_PER_MONTH * MS_PER_DAY),
      year: Math.floor(monthIndex / MONTHS_PER_YEAR),
      monthOfYear: monthIndex % MONTHS_PER_YEAR,
      heightCm: Math.max(0, Math.round(snapshot.heightCm * growthBias * wobble)),
      canopyCm: Math.max(0, Math.round(snapshot.canopyCm * growthBias * wobble)),
      trunkMm: Math.max(0, Math.round(snapshot.trunkMm * growthBias)),
      annualCo2Kg: Math.round(snapshot.annualCo2Kg * 10) / 10,
      cumulativeCo2Kg: Math.round(cumulativeCo2Kg * 10) / 10,
    });
  }

  return points;
}
