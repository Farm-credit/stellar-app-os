/**
 * Types for the ML tree survival prediction model (#1156).
 *
 * The model predicts the probability (0–1) that a planted tree survives
 * to its first annual verification milestone, based on species, region,
 * climate normals, soil characteristics, and historical planting outcomes.
 */

/** Soil texture classification following USDA taxonomy */
export type SoilTexture =
  | 'clay'
  | 'silty-clay'
  | 'clay-loam'
  | 'silt-loam'
  | 'loam'
  | 'sandy-loam'
  | 'loamy-sand'
  | 'sand';

/** Topographic position of the planting site */
export type TopoPosition = 'lowland' | 'mid-slope' | 'ridge' | 'riparian' | 'flat';

/** Categorical confidence level for the prediction */
export type SurvivalConfidence = 'high' | 'medium' | 'low';

// ── Model inputs ──────────────────────────────────────────────────────────────

export interface SoilCharacteristics {
  /** Topsoil organic matter percentage (0–20) */
  organicMatterPercent: number;
  /** Soil pH (3.5–9.0) */
  ph: number;
  /** Available water holding capacity in mm/m */
  waterHoldingCapacityMm: number;
  texture: SoilTexture;
}

export interface PlantingSiteClimate {
  /** Mean annual rainfall in mm */
  annualRainfallMm: number;
  /** Mean annual temperature in °C */
  meanTemperatureC: number;
  /** Dry season length in months (0–12) */
  drySeasonMonths: number;
  /** Mean annual solar radiation in MJ/m²/day */
  solarRadiationMjM2Day?: number;
}

export interface HistoricalPlantingRecord {
  /** Species slug matching the species catalogue */
  speciesSlug: string;
  /** Region key matching the oracle region hash */
  regionKey: string;
  /** Number of trees planted in this historical batch */
  treesPlanted: number;
  /** Number that survived to 12-month verification */
  treesSurvived: number;
  /** ISO-8601 planting date */
  plantedAt: string;
}

export interface SurvivalPredictionInput {
  /** Species slug from the species catalogue */
  speciesSlug: string;
  /** Common name of the species (used for logging, not the model) */
  speciesCommonName?: string;
  /** FAO ecological biome label, e.g. "Tropical moist forest" */
  biome: string;
  /** Climate normals for the planting site */
  climate: PlantingSiteClimate;
  /** Soil characteristics of the planting site */
  soil: SoilCharacteristics;
  /** Region key matching the oracle hash */
  regionKey: string;
  /** ISO-8601 planting date (used to derive season) */
  plantingDate: string;
  /**
   * Aggregated historical survival records for the same species/region.
   * If empty, the model falls back to species-level priors.
   */
  historicalRecords?: HistoricalPlantingRecord[];
}

// ── Model output ──────────────────────────────────────────────────────────────

export interface SurvivalFeatureImportance {
  /** Historical survival rate for this species × region (0–1) */
  historicalSurvivalRate: number;
  /** Climate suitability score (0–1) */
  climateSuitability: number;
  /** Soil quality score (0–1) */
  soilQuality: number;
  /** Planting season score (0–1); wet season planting scores higher */
  plantingSeasonScore: number;
  /** Biome-species match score (0–1) */
  biomeMatchScore: number;
}

export interface SurvivalPredictionResult {
  /** Predicted survival probability (0.0 – 1.0) */
  survivalProbability: number;
  /** Probability expressed as a percentage (0 – 100) */
  survivalPercent: number;
  /** Categorical confidence in the prediction */
  confidence: SurvivalConfidence;
  /** Per-feature contribution scores used to compute the prediction */
  featureImportance: SurvivalFeatureImportance;
  /** Human-readable summary of the top risk factors */
  riskFactors: string[];
  /** ISO-8601 timestamp of when the prediction was made */
  predictedAt: string;
  /** Model version identifier */
  modelVersion: string;
}

// ── API shapes ────────────────────────────────────────────────────────────────

export interface SurvivalPredictRequest extends SurvivalPredictionInput {}

export interface SurvivalPredictResponse extends SurvivalPredictionResult {
  speciesSlug: string;
  regionKey: string;
}

export interface SurvivalBatchPredictRequest {
  predictions: SurvivalPredictionInput[];
}

export interface SurvivalBatchPredictResponse {
  results: SurvivalPredictResponse[];
  batchSize: number;
  processedAt: string;
}
