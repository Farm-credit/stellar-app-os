/**
 * Land cover classification and change detection from spectral indices.
 *
 * Classification approach:
 *   Spectral band thresholds are derived from well-known remote-sensing rules:
 *   - Water:  NDVI < 0 and SWIR reflectance is low.
 *   - Urban:  Low NDVI, high SWIR (built surfaces reflect strongly in SWIR).
 *   - Forest: NDVI > 0.5, SWIR moderate (wood/bark differs from bare soil).
 *   - Cropland: Moderate NDVI + higher SWIR variability (harvested fields).
 *
 * Change detection compares two land-cover snapshots:
 *   - Forest fraction delta = (to_forest − from_forest).
 *   - Deforestation threshold: > 10% forest fraction loss.
 *   - Reforestation threshold: > 10% forest fraction gain.
 *
 * References:
 *   FAO (2020) Global Forest Resources Assessment.
 *   ESA CCI Land Cover product — spectral class definitions.
 *   Copernicus CGLS NDVI thresholds (CLMS bulletin).
 */

import { computeEvi, computeNdvi, computeSavi } from './ndvi';
import type {
  LandCoverChange,
  LandCoverClass,
  LandCoverDistribution,
  LandCoverSnapshot,
  SpectralBands,
} from './types';

// ── Classification thresholds ─────────────────────────────────────────────────

/** Fraction-loss threshold for deforestation alert. */
const DEFORESTATION_THRESHOLD = 0.1;

/** Fraction-gain threshold for reforestation confirmation. */
const REFORESTATION_THRESHOLD = 0.1;

/** NDVI threshold separating vegetated from non-vegetated. */
const VEGETATION_NDVI = 0.2;

/** NDVI threshold separating dense forest from sparse vegetation. */
const FOREST_NDVI = 0.5;

/** NDVI threshold for the dense-canopy class. */
const DENSE_FOREST_NDVI = 0.7;

/** SWIR1 threshold that helps separate urban/bare from dense vegetation. */
const URBAN_SWIR1 = 0.15;

/** SWIR1 threshold below which water is very likely. */
const WATER_SWIR1 = 0.05;

// ── Classification ────────────────────────────────────────────────────────────

/**
 * Classify a pixel or average tile value into a single LandCoverClass.
 *
 * The algorithm runs a decision tree based on NDVI and SWIR1 (where available).
 * When SWIR1 is absent the classification falls back to NDVI-only rules.
 *
 * @param bands - Spectral reflectance values for the tile.
 * @returns     Single best-fit LandCoverClass.
 */
export function classifyLandCover(bands: SpectralBands): LandCoverClass {
  const ndvi = computeNdvi(bands.nir, bands.red);
  const swir1 = bands.swir1;

  // Cloud / shadow heuristic: very low NIR + low Red is ambiguous.
  // We mark it as cloud_shadow rather than misclassify.
  if (bands.nir < 0.05 && bands.red < 0.05) {
    return 'cloud_shadow';
  }

  // Water: negative NDVI and low SWIR
  if (ndvi < 0) {
    if (swir1 === undefined || swir1 < WATER_SWIR1) return 'water';
    // High SWIR with negative NDVI → urban impervious surface
    if (swir1 > URBAN_SWIR1) return 'urban';
    return 'water';
  }

  // Non-vegetated areas
  if (ndvi < VEGETATION_NDVI) {
    if (swir1 !== undefined && swir1 > URBAN_SWIR1) return 'urban';
    return 'bare_soil';
  }

  // Vegetated spectrum
  if (ndvi >= DENSE_FOREST_NDVI) return 'dense_forest';
  if (ndvi >= FOREST_NDVI) return 'sparse_forest';

  // 0.2–0.5 range: distinguish grassland, shrubland, and cropland
  // Cropland typically has moderate SWIR1 due to soil exposure between rows
  if (swir1 !== undefined) {
    if (swir1 > 0.2) return 'cropland';
    if (swir1 > 0.1) return 'shrubland';
  }

  return 'grassland';
}

/**
 * Build a probability distribution across land cover classes from a set
 * of average spectral band values for a plot tile.
 *
 * For a single tile we produce a deterministic distribution (one class = 1.0).
 * In production systems this would aggregate pixel-level classifications across
 * all pixels in the plot boundary and produce fractional distributions.
 */
export function computeLandCoverDistribution(bands: SpectralBands): LandCoverDistribution {
  const primaryClass = classifyLandCover(bands);

  // With single-tile average bands, assign 100% to the primary class.
  // Callers with multi-pixel histograms should aggregate classifyLandCover
  // calls across pixels and sum fractions directly.
  const distribution: LandCoverDistribution = {};
  distribution[primaryClass] = 1.0;
  return distribution;
}

/**
 * Build a LandCoverSnapshot from spectral bands and a date string.
 *
 * @param bands  - Spectral reflectance values.
 * @param date   - ISO-8601 acquisition date.
 */
export function buildLandCoverSnapshot(bands: SpectralBands, date: string): LandCoverSnapshot {
  const distribution = computeLandCoverDistribution(bands);
  const ndvi = computeNdvi(bands.nir, bands.red);
  const evi = computeEvi(bands.nir, bands.red, bands.blue);

  return {
    date,
    distribution,
    avgNdvi: round(ndvi, 4),
    avgEvi: evi !== null ? round(evi, 4) : null,
  };
}

// ── Change detection ──────────────────────────────────────────────────────────

/**
 * Compute the total forest fraction from a land-cover distribution.
 * Forest = dense_forest + sparse_forest.
 */
export function computeForestFraction(distribution: LandCoverDistribution): number {
  return (distribution.dense_forest ?? 0) + (distribution.sparse_forest ?? 0);
}

/**
 * Classify the magnitude of a change delta.
 *
 * @param delta - Absolute fractional change value.
 */
function classifyChangeMagnitude(
  delta: number
): LandCoverChange['changeMagnitude'] {
  const abs = Math.abs(delta);
  if (abs < 0.05) return 'none';
  if (abs < 0.15) return 'minor';
  if (abs < 0.30) return 'moderate';
  return 'significant';
}

/**
 * Detect and describe land-cover change between two time-point snapshots.
 *
 * @param from  - Baseline (earlier) snapshot.
 * @param to    - Current (later) snapshot.
 * @returns     LandCoverChange describing the transition.
 */
export function detectLandCoverChange(
  from: LandCoverSnapshot,
  to: LandCoverSnapshot
): LandCoverChange {
  const fromForest = computeForestFraction(from.distribution);
  const toForest = computeForestFraction(to.distribution);
  const forestDelta = toForest - fromForest;

  const deforestationDetected = forestDelta < -DEFORESTATION_THRESHOLD;
  const reforestationConfirmed = forestDelta > REFORESTATION_THRESHOLD;
  const changeMagnitude = classifyChangeMagnitude(forestDelta);

  const forestAreaChangePercent =
    fromForest > 0
      ? round((forestDelta / fromForest) * 100, 1)
      : null;

  // Dominant class transitions
  const fromDominant = dominantClass(from.distribution);
  const toDominant = dominantClass(to.distribution);

  const narrative = buildNarrative({
    fromDate: from.date,
    toDate: to.date,
    fromDominant,
    toDominant,
    forestDelta,
    forestAreaChangePercent,
    deforestationDetected,
    reforestationConfirmed,
    changeMagnitude,
    ndviDelta: round(to.avgNdvi - from.avgNdvi, 3),
  });

  return {
    fromDate: from.date,
    toDate: to.date,
    fromDistribution: from.distribution,
    toDistribution: to.distribution,
    forestFractionDelta: round(forestDelta, 4),
    forestAreaChangePercent,
    deforestationDetected,
    reforestationConfirmed,
    changeMagnitude,
    narrative,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function dominantClass(distribution: LandCoverDistribution): LandCoverClass | 'unknown' {
  let maxFraction = 0;
  let dominant: LandCoverClass | 'unknown' = 'unknown';
  for (const [cls, fraction] of Object.entries(distribution) as [LandCoverClass, number][]) {
    if (fraction > maxFraction) {
      maxFraction = fraction;
      dominant = cls;
    }
  }
  return dominant;
}

/** Human-readable label for a land cover class. */
const LAND_COVER_LABELS: Record<LandCoverClass, string> = {
  water: 'Water',
  bare_soil: 'Bare Soil',
  grassland: 'Grassland',
  shrubland: 'Shrubland',
  sparse_forest: 'Sparse Forest',
  dense_forest: 'Dense Forest',
  cropland: 'Cropland',
  urban: 'Urban',
  cloud_shadow: 'Cloud / Shadow',
};

function formatClass(cls: LandCoverClass | 'unknown'): string {
  if (cls === 'unknown') return 'Unknown';
  return LAND_COVER_LABELS[cls] ?? cls;
}

interface NarrativeArgs {
  fromDate: string;
  toDate: string;
  fromDominant: LandCoverClass | 'unknown';
  toDominant: LandCoverClass | 'unknown';
  forestDelta: number;
  forestAreaChangePercent: number | null;
  deforestationDetected: boolean;
  reforestationConfirmed: boolean;
  changeMagnitude: LandCoverChange['changeMagnitude'];
  ndviDelta: number;
}

function buildNarrative(args: NarrativeArgs): string {
  const {
    fromDate,
    toDate,
    fromDominant,
    toDominant,
    forestDelta,
    forestAreaChangePercent,
    deforestationDetected,
    reforestationConfirmed,
    changeMagnitude,
    ndviDelta,
  } = args;

  const from = formatClass(fromDominant);
  const to = formatClass(toDominant);
  const deltaSign = forestDelta >= 0 ? '+' : '';
  const deltaStr = `${deltaSign}${(forestDelta * 100).toFixed(1)}%`;
  const areaStr =
    forestAreaChangePercent !== null
      ? ` (${forestAreaChangePercent > 0 ? '+' : ''}${forestAreaChangePercent.toFixed(1)}% relative change)`
      : '';

  let headline: string;
  if (deforestationDetected) {
    headline = `⚠ Deforestation detected: forest cover decreased by ${deltaStr}${areaStr} between ${fromDate} and ${toDate}.`;
  } else if (reforestationConfirmed) {
    headline = `✓ Reforestation confirmed: forest cover increased by ${deltaStr}${areaStr} between ${fromDate} and ${toDate}.`;
  } else if (changeMagnitude === 'none') {
    headline = `No significant land-cover change detected between ${fromDate} and ${toDate}.`;
  } else {
    headline = `Minor land-cover change (${deltaStr}) detected between ${fromDate} and ${toDate}.`;
  }

  const classChange =
    fromDominant !== toDominant
      ? ` Dominant class shifted from ${from} to ${to}.`
      : ` Dominant class remains ${from}.`;

  const ndviStr =
    ndviDelta !== 0
      ? ` Average NDVI changed by ${ndviDelta > 0 ? '+' : ''}${ndviDelta.toFixed(3)}.`
      : '';

  return headline + classChange + ndviStr;
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

// Re-export label map for UI use
export { LAND_COVER_LABELS };
