/**
 * Social Impact Score Engine — Issue #1689
 *
 * Calculates a personalised Social Impact Score (out of 1000) for individual sponsors
 * based on four key pillars:
 * 1. Trees funded (max 350 pts)
 * 2. Species diversity (max 250 pts)
 * 3. Geographic spread (max 250 pts)
 * 4. Years of engagement (max 150 pts)
 */

import { getSponsorProfile } from '@/lib/api/sponsors';
import { getSponsorPortfolio } from '@/lib/api/sponsor-portfolio';

export type ImpactScoreFactorKey =
  'treesFunded' | 'speciesDiversity' | 'geographicSpread' | 'yearsOfEngagement';

export interface ImpactScoreFactor {
  id: ImpactScoreFactorKey;
  label: string;
  description: string;
  score: number;
  maxScore: number;
  rawValue: number;
  targetValue: number;
  unit: string;
  percentage: number;
}

export type ImpactTier = 'Seedling' | 'Canopy Guardian' | 'Forest Champion' | 'Biosphere Legend';

export interface SocialImpactScoreResult {
  totalScore: number;
  maxScore: 1000;
  tier: ImpactTier;
  tierLevel: number;
  tierDescription: string;
  tierColor: 'amber' | 'sky' | 'emerald' | 'purple';
  factors: {
    treesFunded: ImpactScoreFactor;
    speciesDiversity: ImpactScoreFactor;
    geographicSpread: ImpactScoreFactor;
    yearsOfEngagement: ImpactScoreFactor;
  };
  tips: string[];
}

export interface SponsorImpactDataInput {
  treesFunded: number;
  speciesCount: number;
  regionsCount: number;
  yearsOfEngagement?: number;
  firstPlantedAt?: string | Date;
  asOfDate?: Date;
}

export const MAX_IMPACT_SCORE = 1000;
export const MAX_TREES_SCORE = 350;
export const MAX_SPECIES_SCORE = 250;
export const MAX_GEOGRAPHIC_SCORE = 250;
export const MAX_ENGAGEMENT_SCORE = 150;

export const TARGET_TREES = 500;
export const TARGET_SPECIES = 10;
export const TARGET_REGIONS = 5;
export const TARGET_YEARS = 3;

/**
 * Calculates the score for trees funded (0 - 350).
 * Uses a progressive curve so early trees have a rewarding impact
 * while reaching 500+ trees achieves the full 350 points.
 */
export function calculateTreesScore(trees: number): number {
  if (!Number.isFinite(trees) || trees <= 0) return 0;
  if (trees >= TARGET_TREES) return MAX_TREES_SCORE;
  const ratio = Math.min(trees / TARGET_TREES, 1);
  return Math.min(MAX_TREES_SCORE, Math.round(MAX_TREES_SCORE * Math.pow(ratio, 0.7)));
}

/**
 * Calculates the species diversity score (0 - 250).
 * 25 points per unique species up to 10 species.
 */
export function calculateSpeciesScore(speciesCount: number): number {
  if (!Number.isFinite(speciesCount) || speciesCount <= 0) return 0;
  const clamped = Math.min(Math.floor(speciesCount), TARGET_SPECIES);
  return Math.min(MAX_SPECIES_SCORE, clamped * 25);
}

/**
 * Calculates geographic spread score (0 - 250).
 * 50 points per unique planting region or project up to 5 regions.
 */
export function calculateGeographicScore(regionsCount: number): number {
  if (!Number.isFinite(regionsCount) || regionsCount <= 0) return 0;
  const clamped = Math.min(Math.floor(regionsCount), TARGET_REGIONS);
  return Math.min(MAX_GEOGRAPHIC_SCORE, clamped * 50);
}

/**
 * Calculates engagement duration in years and resulting score (0 - 150).
 * 50 points per year of engagement up to 3 years.
 */
export function calculateEngagementScore(
  yearsInput?: number,
  firstPlantedAt?: string | Date,
  asOfDate: Date = new Date()
): { years: number; score: number } {
  let years = 0;

  if (typeof yearsInput === 'number' && Number.isFinite(yearsInput)) {
    years = Math.max(0, yearsInput);
  } else if (firstPlantedAt) {
    const start = new Date(firstPlantedAt).getTime();
    const end = asOfDate.getTime();
    if (!Number.isNaN(start) && end > start) {
      years = (end - start) / (1000 * 60 * 60 * 24 * 365.25);
    }
  }

  const roundedYears = Math.round(years * 10) / 10;
  const score = Math.min(
    MAX_ENGAGEMENT_SCORE,
    Math.round((Math.min(years, TARGET_YEARS) / TARGET_YEARS) * MAX_ENGAGEMENT_SCORE)
  );

  return { years: roundedYears, score: Math.max(0, score) };
}

/**
 * Resolves the sponsor tier metadata based on total score.
 */
export function resolveImpactTier(totalScore: number): {
  tier: ImpactTier;
  tierLevel: number;
  tierDescription: string;
  tierColor: 'amber' | 'sky' | 'emerald' | 'purple';
} {
  if (totalScore >= 750) {
    return {
      tier: 'Biosphere Legend',
      tierLevel: 4,
      tierDescription:
        'Continental-scale contributor establishing visionary ecological transformation.',
      tierColor: 'purple',
    };
  }
  if (totalScore >= 500) {
    return {
      tier: 'Forest Champion',
      tierLevel: 3,
      tierDescription:
        'High-impact sponsor driving ecosystem restoration and multi-region resilience.',
      tierColor: 'emerald',
    };
  }
  if (totalScore >= 250) {
    return {
      tier: 'Canopy Guardian',
      tierLevel: 2,
      tierDescription: 'Growing a diverse and sustainable forest footprint across regions.',
      tierColor: 'sky',
    };
  }
  return {
    tier: 'Seedling',
    tierLevel: 1,
    tierDescription:
      'Beginning the climate restoration journey with foundational tree sponsorship.',
    tierColor: 'amber',
  };
}

/**
 * Generates personalized improvement tips based on factor progress.
 */
export function generateImprovementTips(factors: {
  treesFunded: ImpactScoreFactor;
  speciesDiversity: ImpactScoreFactor;
  geographicSpread: ImpactScoreFactor;
  yearsOfEngagement: ImpactScoreFactor;
}): string[] {
  const tips: string[] = [];

  if (factors.treesFunded.rawValue < TARGET_TREES) {
    const remaining = TARGET_TREES - factors.treesFunded.rawValue;
    tips.push(
      `Sponsor ${remaining} more trees to reach the maximum 350-point tree volume milestone.`
    );
  }
  if (factors.speciesDiversity.rawValue < TARGET_SPECIES) {
    const needed = TARGET_SPECIES - factors.speciesDiversity.rawValue;
    tips.push(
      `Diversify with ${needed} additional tree species (+25 pts per new species) to boost resilience.`
    );
  }
  if (factors.geographicSpread.rawValue < TARGET_REGIONS) {
    const needed = TARGET_REGIONS - factors.geographicSpread.rawValue;
    tips.push(
      `Support projects in ${needed} more regions (+50 pts per new region) to expand global reach.`
    );
  }
  if (factors.yearsOfEngagement.rawValue < TARGET_YEARS) {
    tips.push(
      `Maintain your active sponsorship streak over time to earn up to 150 engagement loyalty points.`
    );
  }

  if (tips.length === 0) {
    tips.push('Outstanding work! You have maximized all 4 pillars of the Social Impact Score.');
  }

  return tips;
}

/**
 * Pure calculation engine for Social Impact Score out of 1000.
 */
export function calculateSocialImpactScore(input: SponsorImpactDataInput): SocialImpactScoreResult {
  const safeTrees = Math.max(0, input.treesFunded || 0);
  const safeSpecies = Math.max(0, input.speciesCount || 0);
  const safeRegions = Math.max(0, input.regionsCount || 0);

  const treesScore = calculateTreesScore(safeTrees);
  const speciesScore = calculateSpeciesScore(safeSpecies);
  const geographicScore = calculateGeographicScore(safeRegions);
  const { years, score: engagementScore } = calculateEngagementScore(
    input.yearsOfEngagement,
    input.firstPlantedAt,
    input.asOfDate
  );

  const totalScore = Math.min(
    MAX_IMPACT_SCORE,
    Math.max(0, treesScore + speciesScore + geographicScore + engagementScore)
  );

  const tierMeta = resolveImpactTier(totalScore);

  const factors = {
    treesFunded: {
      id: 'treesFunded' as const,
      label: 'Trees Funded',
      description: 'Total volume of verified trees planted and sponsored.',
      score: treesScore,
      maxScore: MAX_TREES_SCORE,
      rawValue: safeTrees,
      targetValue: TARGET_TREES,
      unit: 'trees',
      percentage: Math.min(100, Math.round((safeTrees / TARGET_TREES) * 100)),
    },
    speciesDiversity: {
      id: 'speciesDiversity' as const,
      label: 'Species Diversity',
      description: 'Variety of native tree species supported for biodiversity.',
      score: speciesScore,
      maxScore: MAX_SPECIES_SCORE,
      rawValue: safeSpecies,
      targetValue: TARGET_SPECIES,
      unit: 'species',
      percentage: Math.min(100, Math.round((safeSpecies / TARGET_SPECIES) * 100)),
    },
    geographicSpread: {
      id: 'geographicSpread' as const,
      label: 'Geographic Spread',
      description: 'Distribution of plantings across distinct regions and biomes.',
      score: geographicScore,
      maxScore: MAX_GEOGRAPHIC_SCORE,
      rawValue: safeRegions,
      targetValue: TARGET_REGIONS,
      unit: 'regions',
      percentage: Math.min(100, Math.round((safeRegions / TARGET_REGIONS) * 100)),
    },
    yearsOfEngagement: {
      id: 'yearsOfEngagement' as const,
      label: 'Years of Engagement',
      description: 'Duration and commitment to verified climate stewardship.',
      score: engagementScore,
      maxScore: MAX_ENGAGEMENT_SCORE,
      rawValue: years,
      targetValue: TARGET_YEARS,
      unit: 'years',
      percentage: Math.min(100, Math.round((years / TARGET_YEARS) * 100)),
    },
  };

  const tips = generateImprovementTips(factors);

  return {
    totalScore,
    maxScore: MAX_IMPACT_SCORE,
    ...tierMeta,
    factors,
    tips,
  };
}

/**
 * Derives the social impact score for a known sponsor by address.
 */
export function getSponsorSocialImpactScore(
  address: string,
  asOfDate: Date = new Date()
): SocialImpactScoreResult | null {
  const profile = getSponsorProfile(address);
  if (!profile) return null;

  const portfolio = getSponsorPortfolio(profile.address, {
    totalTrees: profile.totalTrees,
    totalCo2OffsetTonnes: profile.co2Offset,
  });

  const earliestPlantedAt =
    portfolio.plantingHistory.length > 0
      ? portfolio.plantingHistory[portfolio.plantingHistory.length - 1].plantedAt
      : undefined;

  return calculateSocialImpactScore({
    treesFunded: profile.totalTrees,
    speciesCount: portfolio.forest.totalSpecies,
    regionsCount: portfolio.forest.totalRegions,
    firstPlantedAt: earliestPlantedAt,
    asOfDate,
  });
}
