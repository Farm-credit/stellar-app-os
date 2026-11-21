/**
 * Typed models for the public "Farmer success stories" case studies (issue #1427).
 *
 * These describe verified farmer outcomes across three axes requested by the
 * issue: income earned, land transformation and environmental impact achieved.
 */

export type FarmerStoryVerificationStatus = 'verified' | 'pending';

/** Income the farmer earned from a carbon project over a reporting period. */
export interface FarmerIncomeEarned {
  /** Total USDC paid out to the farmer over the reporting period. */
  totalUsdc: number;
  /** USDC paid over the previous comparable period, used to show growth. */
  previousPeriodUsdc: number;
  /** Human readable reporting period, e.g. "2024 – 2025 season". */
  periodLabel: string;
}

/** How the farmer's land changed after joining the project. */
export interface LandTransformation {
  /** Hectares of degraded land before the project started. */
  degradedHectaresBefore: number;
  /** Hectares of land currently under restoration or restored. */
  restoredHectares: number;
  /** Trees planted across the project. */
  treesPlanted: number;
  /** Share of planted trees that survived first verification, 0–100. */
  survivalRatePercent: number;
  /** Short description of the land before the farmer joined. */
  beforeSummary: string;
  /** Short description of the land after restoration. */
  afterSummary: string;
}

/** Measured environmental outcomes of the project. */
export interface EnvironmentalImpact {
  /** Verified carbon sequestered, in tonnes of CO₂ equivalent. */
  co2SequesteredTonnes: number;
  /** Number of native species planted across the project. */
  nativeSpeciesCount: number;
  /** Optional estimate of water retained by the restored land. */
  waterRetainedMegalitres?: number;
  /** Optional soil-health improvement, 0–100. */
  soilHealthImprovementPercent?: number;
}

/** A single farmer case study rendered on the success stories page. */
export interface FarmerSuccessStory {
  id: string;
  slug: string;
  farmerName: string;
  headline: string;
  summary: string;
  /** State or province the farm is located in. */
  region: string;
  country: string;
  projectName: string;
  projectType: string;
  status: FarmerStoryVerificationStatus;
  featured: boolean;
  /** ISO-8601 date the story was published. */
  storyDate: string;
  incomeEarned: FarmerIncomeEarned;
  landTransformation: LandTransformation;
  environmentalImpact: EnvironmentalImpact;
  /** Optional first-person quote from the farmer. */
  quote?: string;
}

/** Aggregate figures shown above the case-study grid. */
export interface FarmerSuccessStorySummary {
  storyCount: number;
  totalIncomeEarnedUsdc: number;
  totalHectaresRestored: number;
  totalTreesPlanted: number;
  totalCo2SequesteredTonnes: number;
  averageSurvivalRatePercent: number;
}

/** Region / project-type filters for the case-study list. */
export interface FarmerSuccessStoryFilter {
  /** `all` or a region name. */
  region: string;
  /** `all` or a project type. */
  projectType: string;
}
