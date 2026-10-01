/**
 * NDVI, EVI, SAVI and NDRE calculation and vegetation health scoring.
 *
 * All formulas follow the published IEEE/NASA Remote Sensing standards:
 *   NDVI  — Tucker (1979). Remote Sensing of Environment.
 *   EVI   — Huete et al. (2002). Remote Sensing of Environment.
 *   SAVI  — Huete (1988). Remote Sensing of Environment.
 *   NDRE  — Gitelson & Merzlyak (1994). Journal of Plant Physiology.
 */

import type {
  NdviAnalysisResult,
  SpectralBands,
  VegetationHealthClass,
  VegetationIndices,
} from './types';
import { NDVI_THRESHOLDS, NDVI_UNHEALTHY_THRESHOLD } from './types';

// ── Constants ────────────────────────────────────────────────────────────────

/** Soil adjustment factor for SAVI (standard value: 0.5). */
const SAVI_L = 0.5;

/** EVI gain coefficient (standard: 2.5). */
const EVI_G = 2.5;

/** EVI soil-canopy interaction coefficient C1 (standard: 6). */
const EVI_C1 = 6;

/** EVI aerosol resistance coefficient C2 (standard: 7.5). */
const EVI_C2 = 7.5;

/** EVI canopy background adjustment L (standard: 1). */
const EVI_L = 1;

/**
 * Minimum denominator magnitude used to guard against near-zero divisions.
 * Reflectance denominators below this produce 0 rather than infinity.
 */
const MIN_DENOMINATOR = 1e-6;

/** Maximum valid NDVI score on the 0–100 scale (corresponds to NDVI ≈ 0.9+). */
const NDVI_SCORE_CEIL = 0.9;

// ── Core index computation ───────────────────────────────────────────────────

/**
 * Compute NDVI from near-infrared and red reflectance values.
 *
 * Formula: (NIR - RED) / (NIR + RED)
 * Result is clamped to [-1, 1].
 */
export function computeNdvi(nir: number, red: number): number {
  const denominator = nir + red;
  if (Math.abs(denominator) < MIN_DENOMINATOR) return 0;
  return clamp((nir - red) / denominator, -1, 1);
}

/**
 * Compute Enhanced Vegetation Index.
 * Requires blue band. Returns null if blue is not available.
 *
 * Formula: G * (NIR - RED) / (NIR + C1*RED - C2*BLUE + L)
 * Result is clamped to [-1, 1].
 */
export function computeEvi(nir: number, red: number, blue: number | undefined): number | null {
  if (blue === undefined) return null;
  const denominator = nir + EVI_C1 * red - EVI_C2 * blue + EVI_L;
  if (Math.abs(denominator) < MIN_DENOMINATOR) return 0;
  return clamp((EVI_G * (nir - red)) / denominator, -1, 1);
}

/**
 * Compute Soil-Adjusted Vegetation Index.
 *
 * Formula: ((NIR - RED) / (NIR + RED + L)) * (1 + L)
 * Result is clamped to [-1, 1].
 */
export function computeSavi(nir: number, red: number): number {
  const denominator = nir + red + SAVI_L;
  if (Math.abs(denominator) < MIN_DENOMINATOR) return 0;
  return clamp(((nir - red) / denominator) * (1 + SAVI_L), -1, 1);
}

/**
 * Compute Normalised Difference Red-Edge index (Sentinel-2 only).
 * Returns null if red-edge band is not available.
 *
 * Formula: (NIR - RedEdge1) / (NIR + RedEdge1)
 * Particularly sensitive to chlorophyll content in dense canopy.
 */
export function computeNdre(nir: number, redEdge1: number | undefined): number | null {
  if (redEdge1 === undefined) return null;
  const denominator = nir + redEdge1;
  if (Math.abs(denominator) < MIN_DENOMINATOR) return 0;
  return clamp((nir - redEdge1) / denominator, -1, 1);
}

/**
 * Compute all vegetation indices from a set of spectral bands.
 * Only NDVI and SAVI are guaranteed; EVI and NDRE depend on optional bands.
 */
export function computeVegetationIndices(bands: SpectralBands): VegetationIndices {
  return {
    ndvi: round(computeNdvi(bands.nir, bands.red), 4),
    evi: computeEvi(bands.nir, bands.red, bands.blue) !== null
      ? round(computeEvi(bands.nir, bands.red, bands.blue) as number, 4)
      : null,
    savi: round(computeSavi(bands.nir, bands.red), 4),
    ndre: round(computeNdre(bands.nir, bands.redEdge1) ?? 0, 4) !== 0
      ? round(computeNdre(bands.nir, bands.redEdge1) as number, 4)
      : null,
  };
}

// ── Health classification ────────────────────────────────────────────────────

/**
 * Classify an NDVI value into a discrete vegetation health class.
 *
 * Classification thresholds follow FAO/Copernicus guidance for tropical/
 * subtropical planting sites:
 *   < 0.1  → water or cloud
 *   0.1–0.2 → bare soil
 *   0.2–0.35 → sparse vegetation
 *   0.35–0.5 → moderate vegetation
 *   0.5–0.7 → healthy vegetation
 *   ≥ 0.7  → dense canopy
 */
export function classifyVegetationHealth(ndvi: number): VegetationHealthClass {
  if (ndvi >= NDVI_THRESHOLDS.dense_canopy) return 'dense_canopy';
  if (ndvi >= NDVI_THRESHOLDS.healthy_vegetation) return 'healthy_vegetation';
  if (ndvi >= NDVI_THRESHOLDS.moderate_vegetation) return 'moderate_vegetation';
  if (ndvi >= NDVI_THRESHOLDS.sparse_vegetation) return 'sparse_vegetation';
  if (ndvi >= NDVI_THRESHOLDS.bare_soil) return 'bare_soil';
  return 'water_or_cloud';
}

/**
 * Compute a 0–100 health score from an NDVI value.
 *
 * Linear interpolation: NDVI 0 → score 0; NDVI 0.9 → score 100.
 * Values below 0 are clamped to 0; values above the ceiling clamp to 100.
 */
export function computeHealthScore(ndvi: number): number {
  const normalised = clamp(ndvi, 0, NDVI_SCORE_CEIL) / NDVI_SCORE_CEIL;
  return Math.round(normalised * 100);
}

/** Health class labels for display. */
const HEALTH_CLASS_LABELS: Record<VegetationHealthClass, string> = {
  water_or_cloud: 'Water / Cloud Cover',
  bare_soil: 'Bare Soil',
  sparse_vegetation: 'Sparse Vegetation',
  moderate_vegetation: 'Moderate Vegetation',
  healthy_vegetation: 'Healthy Vegetation',
  dense_canopy: 'Dense Forest Canopy',
};

/** Human-readable summaries by health class. */
const HEALTH_CLASS_SUMMARIES: Record<VegetationHealthClass, string> = {
  water_or_cloud:
    'Pixel represents water, cloud, or deep shadow. Tree health cannot be assessed.',
  bare_soil:
    'Very low vegetation signal. Soil is exposed; trees may be newly planted or absent.',
  sparse_vegetation:
    'Low vegetation signal. Early-stage or stressed vegetation detected.',
  moderate_vegetation:
    'Moderate vegetation density. Trees are establishing but not yet at full canopy.',
  healthy_vegetation:
    'Good vegetation health. Established canopy with strong chlorophyll signal.',
  dense_canopy:
    'Dense, mature forest canopy detected. Excellent vegetation health signal.',
};

// ── Full analysis ────────────────────────────────────────────────────────────

/**
 * Run a full NDVI analysis for a set of spectral bands.
 *
 * @param bands       - Surface-reflectance spectral bands.
 * @param imageDate   - ISO-8601 date of the image, if known.
 * @returns           Full NdviAnalysisResult.
 */
export function analyseVegetation(
  bands: SpectralBands,
  imageDate: string | null = null
): NdviAnalysisResult {
  const indices = computeVegetationIndices(bands);
  const healthClass = classifyVegetationHealth(indices.ndvi);
  const healthScore = computeHealthScore(indices.ndvi);
  const isUnhealthy = indices.ndvi < NDVI_UNHEALTHY_THRESHOLD;

  const label = HEALTH_CLASS_LABELS[healthClass];
  const detailSummary = HEALTH_CLASS_SUMMARIES[healthClass];
  const ndviStr = indices.ndvi.toFixed(3);
  const scoreStr = healthScore.toString();

  const summary =
    `${label} (NDVI ${ndviStr}, score ${scoreStr}/100). ${detailSummary}`;

  return {
    indices,
    healthClass,
    healthScore,
    isUnhealthy,
    summary,
    imageDate,
  };
}

// ── Utility ──────────────────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

// Re-export classification label map for UI use
export { HEALTH_CLASS_LABELS };
