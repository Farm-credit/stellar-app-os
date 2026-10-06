/**
 * Buyer Risk Scoring Service
 * Issue #1294: Calculate risk scores for carbon credit projects
 *
 * This module implements the scoring logic for four pillars:
 * 1. Verifier Reputation (25%)
 * 2. Methodology Strength (20%)
 * 3. Regional Stability (20%)
 * 4. Farmer Track Record (35%)
 *
 * Each pillar produces a 0-100 sub-score. The overall score is a weighted
 * average, then converted to a risk rating (Low/Medium/High).
 *
 * All functions are pure and deterministic.
 */

import type {
  SubScores,
  Weights,
  RiskRating,
  FarmerProfileForScoring,
  CarbonProjectForScoring,
  CarbonMethodologyForScoring,
  PlantingLocationForScoring,
} from '@/lib/schemas/project-risk-score.schema';

/**
 * Named, configurable weights for combining sub-scores.
 * Sum must equal 1.0.
 *
 * Rationale:
 * - Farmer track record (35%): Most direct signal of project delivery success
 * - Verifier reputation (25%): Establishes credibility of claims
 * - Methodology strength (20%): Affects calculation accuracy
 * - Regional stability (20%): External risk factor (least controllable)
 */
export const RISK_SCORE_WEIGHTS = Object.freeze({
  verifierReputation: 0.25,
  methodologyStrength: 0.20,
  regionalStability: 0.20,
  farmerTrackRecord: 0.35,
} as const);

// Validate weights sum to 1.0
const weightSum = Object.values(RISK_SCORE_WEIGHTS).reduce((a, b) => a + b, 0);
if (Math.abs(weightSum - 1.0) > 0.001) {
  throw new Error(`Risk score weights must sum to 1.0, got ${weightSum}`);
}

/**
 * Risk rating thresholds (0-100 scale, lower = less risk)
 */
export const RISK_RATING_THRESHOLDS = Object.freeze({
  low: 80,
  medium: 60,
} as const);

/**
 * Regional stability tiers based on IMF and World Bank indices
 *
 * Sources:
 * - IMF Financial Stress Index: https://www.imf.org/external/research/index.aspx
 * - World Bank Worldwide Governance Indicators: https://www.worldbank.org/en/publication/worldwide-governance-indicators
 */
const REGIONAL_STABILITY_TIERS = Object.freeze({
  'North America': 95,
  'Western Europe': 95,
  'Southeast Asia': 70,
  'South Asia': 65,
  'Latin America': 75,
  'West Africa': 60,
  'Sub-Saharan Africa': 60,
  'Other': 50,
} as const);

type RegionKey = keyof typeof REGIONAL_STABILITY_TIERS;

/**
 * Utility: clamp a value to [min, max]
 */
function clamp(value: number, min = 0, max = 100): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/**
 * Utility: round to 1 decimal place
 */
function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Calculate Verifier Reputation Sub-Score (0-100)
 *
 * Data inputs:
 * - verificationStatus: The certification standard used (Gold Standard, Verra, etc.)
 * - methodologyMetadataVerified: Whether the methodology has been verified against official registry
 *
 * Formula:
 * - Base score by verifier type (40-95)
 * - Adjust by metadata verification status (+5 or -5)
 *
 * Limitations:
 * - Uses verifier type as proxy; no individual verifier reputation metrics available
 * - Future work: Build verifier entity table with detailed metrics
 */
export function calculateVerifierReputationScore(
  verificationStatus: string,
  methodologyMetadataVerified: boolean
): number {
  const verifierTierScores: Record<string, number> = {
    'Gold Standard': 95,
    'Verra (VCS)': 90,
    'Climate Action Reserve': 85,
    'Plan Vivo': 80,
    Pending: 40,
  };

  let baseScore = verifierTierScores[verificationStatus] ?? 40;

  // Adjust for methodology verification
  if (methodologyMetadataVerified) {
    baseScore = Math.min(100, baseScore + 5);
  } else {
    baseScore = Math.max(0, baseScore - 5);
  }

  return clamp(baseScore);
}

/**
 * Calculate Methodology Strength Sub-Score (0-100)
 *
 * Data inputs:
 * - metadataVerified: Whether methodology has been verified against official registry
 * - formula: Indicates methodology is fully specified
 * - parameters: Array of method parameters
 *
 * Formula:
 * - Base: 70 (all methodologies in system are pre-seeded and credible)
 * - +20 if verified against official source
 * - +10 if formula and parameters are fully specified
 *
 * Limitations:
 * - Simple heuristic; doesn't capture actual methodological rigor
 * - Future work: Expert review could assign strength scores per category
 */
export function calculateMethodologyStrengthScore(
  metadataVerified: boolean,
  formula?: string,
  parameters?: unknown[]
): number {
  let score = 70; // Baseline for registered methodology

  if (metadataVerified) {
    score += 20; // +20 for verified against official registry
  }

  if (formula && parameters && parameters.length > 0) {
    score += 10; // +10 for complete formula specification
  }

  return clamp(score);
}

/**
 * Calculate Regional Stability Sub-Score (0-100)
 *
 * Data inputs:
 * - region: Operating region (one of the predefined regions)
 *
 * Formula:
 * - Static tier mapping based on IMF and World Bank stability indices
 * - Returns tier score for the region, or 50 (neutral) if unknown
 *
 * Limitations:
 * - Static: Does not reflect current geopolitical conditions
 * - Coarse: Single score per region; no within-region variation
 * - Future work: Integrate live regional risk API; add country-level granularity
 */
export function calculateRegionalStabilityScore(region?: string): number {
  if (!region) {
    return 50; // Neutral default if region not provided
  }

  const score = REGIONAL_STABILITY_TIERS[region as RegionKey];
  return score !== undefined ? score : 50; // Default to 50 if region not recognized
}

/**
 * Calculate Farmer Track Record Sub-Score (0-100)
 *
 * Data inputs:
 * - verified: Platform verification status
 * - kycTier: KYC compliance tier (0, 1, 2, 3+)
 * - averageRating: Buyer review average (1-5 stars)
 * - reviewCount: Number of buyer reviews
 *
 * Formula:
 * - Base: 50 (neutral for new/unverified farmer)
 * - +15 if verified
 * - +5-15 based on KYC tier
 * - Up to +15 from buyer review rating (1-5 stars)
 * - Up to +15 from review count (normalized: 5+ reviews → 15 points)
 *
 * Limitations:
 * - Only buyer review aggregates available; no escrow or milestone payment history
 * - Missing tree-survival correlation data
 * - Future work: Add escrow history, milestone completions, tree-survival rates
 */
export function calculateFarmerTrackRecordScore(farmer: FarmerProfileForScoring): number {
  let score = 50; // Neutral baseline

  // Verification status bonus
  if (farmer.verified) {
    score += 15; // +15 for platform verification
  }

  // KYC tier bonus (progressive)
  if (farmer.kycTier >= 3) {
    score += 15; // +15 for highest KYC tier
  } else if (farmer.kycTier === 2) {
    score += 10; // +10 for mid-level KYC
  } else if (farmer.kycTier >= 1) {
    score += 5; // +5 for basic KYC
  }

  // Buyer review rating bonus (0-15 points from 1-5 stars)
  let ratingBonus = 0;
  if (farmer.averageRating && farmer.averageRating > 0) {
    ratingBonus = (farmer.averageRating / 5) * 15;
  }

  // Review count bonus (0-15 points, capped at 5+ reviews)
  let reviewBonus = 0;
  if (farmer.reviewCount && farmer.reviewCount > 0) {
    reviewBonus = Math.min(15, farmer.reviewCount / 3); // 5 reviews → 15 points
  }

  score = score + ratingBonus + reviewBonus;

  return clamp(score);
}

/**
 * Combine all sub-scores into an overall risk score using configured weights
 *
 * Returns overall score (0-100, lower = less risk)
 */
export function combineSubScoresIntoOverallScore(subScores: SubScores): number {
  const weighted =
    subScores.verifierReputation * RISK_SCORE_WEIGHTS.verifierReputation +
    subScores.methodologyStrength * RISK_SCORE_WEIGHTS.methodologyStrength +
    subScores.regionalStability * RISK_SCORE_WEIGHTS.regionalStability +
    subScores.farmerTrackRecord * RISK_SCORE_WEIGHTS.farmerTrackRecord;

  return clamp(Math.round(weighted));
}

/**
 * Determine risk rating based on overall score
 *
 * Thresholds:
 * - >= 80: 'Low' (safe investment)
 * - >= 60: 'Medium' (acceptable with monitoring)
 * - < 60: 'High' (elevated risk)
 */
export function determineRiskRating(overallScore: number): RiskRating {
  if (overallScore >= RISK_RATING_THRESHOLDS.low) {
    return 'Low';
  }
  if (overallScore >= RISK_RATING_THRESHOLDS.medium) {
    return 'Medium';
  }
  return 'High';
}

/**
 * Calculate all sub-scores for a project
 *
 * This is the main entry point for scoring a project from its domain models.
 * Returns a SubScores object with all four pillar scores.
 */
export function calculateAllSubScores(
  project: CarbonProjectForScoring,
  methodology: CarbonMethodologyForScoring,
  region: PlantingLocationForScoring,
  farmer: FarmerProfileForScoring
): SubScores {
  return {
    verifierReputation: calculateVerifierReputationScore(
      project.verificationStatus,
      methodology.metadataVerified
    ),
    methodologyStrength: calculateMethodologyStrengthScore(
      methodology.metadataVerified,
      methodology.formula,
      methodology.parameters
    ),
    regionalStability: calculateRegionalStabilityScore(region.region),
    farmerTrackRecord: calculateFarmerTrackRecordScore(farmer),
  };
}

/**
 * Document data gaps discovered during scoring
 *
 * Returns array of strings describing limitations affecting this score.
 * These are included in the response for transparency.
 */
export function identifyDataGaps(): string[] {
  return [
    'Regional stability uses static tier based on region; no live geopolitical risk data integrated',
    'Verifier reputation uses certification tier as proxy; no detailed verifier entity metrics (reversals, disputes) available',
    'Farmer track record excludes escrow/milestone payment history and tree-survival correlation',
  ];
}

/**
 * Export weight constants for validation and configuration
 */
export function getWeights(): Weights {
  return { ...RISK_SCORE_WEIGHTS };
}

/**
 * Get all available regions for regional stability scoring
 */
export function getAvailableRegions(): string[] {
  return Object.keys(REGIONAL_STABILITY_TIERS);
}

/**
 * Get regional stability tier for a specific region
 */
export function getRegionalStabilityTier(region: string): number {
  return calculateRegionalStabilityScore(region);
}
