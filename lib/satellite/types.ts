/**
 * Shared types and constants for the satellite environmental verification system.
 *
 * This module provides the data contracts used across NDVI calculation, tree-count
 * estimation, land-cover change detection, and the orchestrating verifier class.
 *
 * Data sources supported:
 *   - Sentinel-2 (ESA Copernicus) — preferred; 10–60 m resolution
 *   - Landsat 8/9 (USGS) — fallback; 30 m resolution
 *   - Planet Labs — optional commercial upgrade; 3–5 m resolution
 */

// ── Band value types ─────────────────────────────────────────────────────────

/**
 * Normalised spectral band reflectance values from a satellite image tile.
 * All values should be in [0, 1] (surface reflectance, not DN).
 *
 * Sentinel-2 band naming is used; Landsat equivalents are noted in comments.
 */
export interface SpectralBands {
  /** Red band — Sentinel-2 B04, Landsat B4 */
  red: number;
  /** Near-infrared band — Sentinel-2 B08, Landsat B5 */
  nir: number;
  /** Blue band — Sentinel-2 B02, Landsat B2 */
  blue?: number;
  /** Green band — Sentinel-2 B03, Landsat B3 */
  green?: number;
  /** Short-wave infrared 1 — Sentinel-2 B11, Landsat B6 */
  swir1?: number;
  /** Short-wave infrared 2 — Sentinel-2 B12, Landsat B7 */
  swir2?: number;
  /** Red-edge 1 — Sentinel-2 B05 only */
  redEdge1?: number;
}

// ── NDVI / vegetation index types ───────────────────────────────────────────

/** Raw output of a single NDVI/EVI computation from a spectral band set. */
export interface VegetationIndices {
  /**
   * Normalised Difference Vegetation Index. Range: [-1, 1].
   * Healthy dense vegetation: > 0.5. Bare soil: 0.1–0.2. Water: < 0.
   */
  ndvi: number;
  /**
   * Enhanced Vegetation Index. More resistant to soil and atmospheric noise.
   * Range: [-1, 1]. Requires blue band; null if unavailable.
   */
  evi: number | null;
  /**
   * Soil-Adjusted Vegetation Index. Uses soil adjustment factor L = 0.5.
   * More accurate in areas with sparse vegetation cover.
   */
  savi: number;
  /**
   * Modified NDVI — uses red-edge band instead of NIR for canopy applications.
   * Only available for Sentinel-2. Null if redEdge1 not supplied.
   */
  ndre: number | null;
}

/** Health classification derived from NDVI. */
export type VegetationHealthClass =
  | 'water_or_cloud'
  | 'bare_soil'
  | 'sparse_vegetation'
  | 'moderate_vegetation'
  | 'healthy_vegetation'
  | 'dense_canopy';

/** NDVI thresholds for each health class (lower bound, inclusive). */
export const NDVI_THRESHOLDS: Record<VegetationHealthClass, number> = {
  water_or_cloud: -1.0, // < BARE_SOIL_THRESHOLD
  bare_soil: 0.1,
  sparse_vegetation: 0.2,
  moderate_vegetation: 0.35,
  healthy_vegetation: 0.5,
  dense_canopy: 0.7,
};

/** NDVI value considered unhealthy — triggers a warning flag. */
export const NDVI_UNHEALTHY_THRESHOLD = 0.2;

/** Full NDVI analysis result for a location or plot. */
export interface NdviAnalysisResult {
  /** Computed vegetation indices from the supplied spectral bands. */
  indices: VegetationIndices;
  /** Discrete health classification for the dominant NDVI value. */
  healthClass: VegetationHealthClass;
  /**
   * Health score in [0, 100].
   * Maps NDVI linearly: 0 → 0, 0.9+ → 100.
   */
  healthScore: number;
  /** Whether the NDVI value represents clearly unhealthy or absent vegetation. */
  isUnhealthy: boolean;
  /** Human-readable health summary. */
  summary: string;
  /** ISO-8601 acquisition date of the image data, if known. */
  imageDate: string | null;
}

// ── Tree count types ─────────────────────────────────────────────────────────

/** Metadata describing an image tile used for tree-count estimation. */
export interface ImageryMetadata {
  /** Ground sampling distance in metres per pixel. */
  resolutionMetersPerPixel: number;
  /** Plot area in hectares. */
  plotAreaHectares: number;
  /**
   * Canopy cover fraction in [0, 1], derived from high-confidence
   * vegetation pixels (NDVI > 0.5) as a proportion of the plot area.
   */
  canopyCoverFraction: number;
  /**
   * Estimated mean crown diameter in metres.
   * If null, a species-appropriate default is used.
   */
  estimatedCrownDiameterMeters?: number;
  /** Tree species (slug), used to look up crown-diameter defaults. */
  speciesSlug?: string;
}

/** Crown diameter defaults by species slug (metres). */
export const CROWN_DIAMETER_DEFAULTS: Record<string, number> = {
  teak: 8,
  moringa: 4,
  eucalyptus: 5,
  mangrove: 3,
  mahogany: 10,
  iroko: 12,
  neem: 6,
  acacia: 5,
  default: 6,
};

/** Packing efficiency constant for tree crowns (accounts for gaps between trees). */
export const CANOPY_PACKING_EFFICIENCY = 0.65;

/** Tree-count estimation result for a plot. */
export interface TreeCountResult {
  /** Estimated total tree count. */
  estimatedCount: number;
  /**
   * 95% confidence interval bounds.
   * Accounts for crown-diameter uncertainty (±20%) and canopy measurement error.
   */
  confidenceInterval: { low: number; high: number };
  /** Crown diameter used in the calculation (metres). */
  crownDiameterUsed: number;
  /** Plot area in hectares. */
  plotAreaHectares: number;
  /** Canopy cover fraction used. */
  canopyCoverFraction: number;
  /** Claimed tree count to verify against, if provided. */
  claimedCount?: number;
  /**
   * Verification outcome when a claimed count was provided.
   * 'pass' — estimated count is within ±30% of claimed.
   * 'marginal' — within ±50%.
   * 'fail' — outside ±50%.
   */
  verificationStatus?: 'pass' | 'marginal' | 'fail';
  /** Human-readable explanation. */
  summary: string;
}

// ── Land cover types ─────────────────────────────────────────────────────────

/** Land cover classes derived from spectral indices. */
export type LandCoverClass =
  | 'water'
  | 'bare_soil'
  | 'grassland'
  | 'shrubland'
  | 'sparse_forest'
  | 'dense_forest'
  | 'cropland'
  | 'urban'
  | 'cloud_shadow';

/** Fraction of a plot area occupied by each land cover class. */
export type LandCoverDistribution = Partial<Record<LandCoverClass, number>>;

/**
 * A snapshot of land cover for a single date.
 * Fractions must sum to ≈1; may not sum exactly due to rounding.
 */
export interface LandCoverSnapshot {
  /** ISO-8601 date of the satellite image. */
  date: string;
  /** Land cover fractions. */
  distribution: LandCoverDistribution;
  /** NDVI and EVI averages across the plot at this date. */
  avgNdvi: number;
  avgEvi: number | null;
}

/** Change between two land cover snapshots. */
export interface LandCoverChange {
  fromDate: string;
  toDate: string;
  fromDistribution: LandCoverDistribution;
  toDistribution: LandCoverDistribution;
  /**
   * Net change in forest fraction (dense_forest + sparse_forest).
   * Positive = reforestation; negative = deforestation.
   */
  forestFractionDelta: number;
  /**
   * Percentage change in forest area relative to the earlier snapshot.
   * Null if no forest existed in the baseline.
   */
  forestAreaChangePercent: number | null;
  /** Whether significant deforestation (> 10% loss) was detected. */
  deforestationDetected: boolean;
  /** Whether significant reforestation (> 10% gain) was detected. */
  reforestationConfirmed: boolean;
  /** Magnitude classification of change. */
  changeMagnitude: 'none' | 'minor' | 'moderate' | 'significant';
  /** Human-readable narrative of the change. */
  narrative: string;
}

// ── Verifier types ───────────────────────────────────────────────────────────

/**
 * Input payload for a full satellite verification run.
 * Callers supply the most data they have; the verifier degrades gracefully.
 */
export interface SatelliteVerificationRequest {
  /** Unique planting-job or tree ID. */
  plotId: string;
  /** Decimal-degree coordinates. */
  coordinates: { latitude: number; longitude: number };
  /** Plot boundary area in hectares. */
  plotAreaHectares: number;
  /**
   * Current spectral bands (most recent image).
   * Must supply at minimum red + nir.
   */
  currentBands: SpectralBands;
  /**
   * Baseline spectral bands (pre-planting image).
   * Used for land-cover change detection. Optional.
   */
  baselineBands?: SpectralBands;
  /** Imagery metadata for tree-count estimation. */
  imageryMetadata: ImageryMetadata;
  /** Acquisition date for the current bands. */
  imageryDate?: string;
  /** Acquisition date for the baseline bands. */
  baselineDate?: string;
  /** Claimed tree count to verify. */
  claimedTreeCount?: number;
  /** Species slug for crown-diameter lookup. */
  speciesSlug?: string;
}

/**
 * Full output of a satellite verification run.
 */
export interface SatelliteVerificationResult {
  plotId: string;
  verifiedAt: string; // ISO-8601 timestamp
  /** NDVI / vegetation health analysis result. */
  vegetation: NdviAnalysisResult;
  /** Tree-count estimation. */
  treeCount: TreeCountResult;
  /**
   * Land-cover change analysis.
   * Null if no baseline bands were provided.
   */
  landCoverChange: LandCoverChange | null;
  /**
   * Overall verification verdict.
   * 'verified' — all checks pass.
   * 'partially_verified' — some checks pass but issues were detected.
   * 'failed' — critical checks failed.
   * 'insufficient_data' — not enough data to reach a conclusion.
   */
  verdict: 'verified' | 'partially_verified' | 'failed' | 'insufficient_data';
  /** 0–100 overall confidence score. */
  confidenceScore: number;
  /** List of specific flags raised during verification. */
  flags: VerificationFlag[];
}

/** A single flag raised by a verification check. */
export interface VerificationFlag {
  code: string;
  severity: 'info' | 'warning' | 'critical';
  message: string;
}

/** Allowed severity levels for ordering/display. */
export const FLAG_SEVERITY_ORDER: Record<VerificationFlag['severity'], number> = {
  info: 0,
  warning: 1,
  critical: 2,
};
