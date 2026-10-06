import type {
  FarmerSuccessStory,
  FarmerSuccessStoryFilter,
  FarmerSuccessStorySummary,
} from '@/lib/types/farmer-success-story';

/** Filter value that disables a region or project-type filter. */
export const ALL_FILTER_VALUE = 'all';

/**
 * Percentage change between the current and previous reporting period.
 * Returns 0 when there is no comparable previous period.
 */
export function computeIncomeGrowthPercent(story: FarmerSuccessStory): number {
  const { totalUsdc, previousPeriodUsdc } = story.incomeEarned;
  if (previousPeriodUsdc <= 0) return 0;
  return Math.round(((totalUsdc - previousPeriodUsdc) / previousPeriodUsdc) * 1000) / 10;
}

/** Featured stories first, then most recent. */
export function sortFarmerSuccessStories(stories: FarmerSuccessStory[]): FarmerSuccessStory[] {
  return [...stories].sort((a, b) => {
    if (a.featured !== b.featured) return a.featured ? -1 : 1;
    return b.storyDate.localeCompare(a.storyDate);
  });
}

/** Apply region and project-type filters, preserving featured-first ordering. */
export function filterFarmerSuccessStories(
  stories: FarmerSuccessStory[],
  filter: FarmerSuccessStoryFilter
): FarmerSuccessStory[] {
  return sortFarmerSuccessStories(stories).filter((story) => {
    const regionMatches = filter.region === ALL_FILTER_VALUE || story.region === filter.region;
    const typeMatches =
      filter.projectType === ALL_FILTER_VALUE || story.projectType === filter.projectType;
    return regionMatches && typeMatches;
  });
}

/** Unique region names, alphabetically sorted, for the filter control. */
export function getUniqueRegions(stories: FarmerSuccessStory[]): string[] {
  return Array.from(new Set(stories.map((story) => story.region))).sort();
}

/** Unique project types, alphabetically sorted, for the filter control. */
export function getUniqueProjectTypes(stories: FarmerSuccessStory[]): string[] {
  return Array.from(new Set(stories.map((story) => story.projectType))).sort();
}

/** Aggregate the income, land and environmental figures for a set of stories. */
export function summarizeFarmerSuccessStories(
  stories: FarmerSuccessStory[]
): FarmerSuccessStorySummary {
  if (stories.length === 0) {
    return {
      storyCount: 0,
      totalIncomeEarnedUsdc: 0,
      totalHectaresRestored: 0,
      totalTreesPlanted: 0,
      totalCo2SequesteredTonnes: 0,
      averageSurvivalRatePercent: 0,
    };
  }

  const totals = stories.reduce(
    (acc, story) => {
      acc.totalIncomeEarnedUsdc += story.incomeEarned.totalUsdc;
      acc.totalHectaresRestored += story.landTransformation.restoredHectares;
      acc.totalTreesPlanted += story.landTransformation.treesPlanted;
      acc.totalCo2SequesteredTonnes += story.environmentalImpact.co2SequesteredTonnes;
      acc.survival += story.landTransformation.survivalRatePercent;
      return acc;
    },
    {
      totalIncomeEarnedUsdc: 0,
      totalHectaresRestored: 0,
      totalTreesPlanted: 0,
      totalCo2SequesteredTonnes: 0,
      survival: 0,
    }
  );

  return {
    storyCount: stories.length,
    totalIncomeEarnedUsdc: totals.totalIncomeEarnedUsdc,
    totalHectaresRestored: totals.totalHectaresRestored,
    totalTreesPlanted: totals.totalTreesPlanted,
    totalCo2SequesteredTonnes: totals.totalCo2SequesteredTonnes,
    averageSurvivalRatePercent: Math.round((totals.survival / stories.length) * 10) / 10,
  };
}

/** Format a USDC amount without cents, e.g. `$4,850`. */
export function formatUsdcAmount(amount: number): string {
  return `$${amount.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

/** Format a land area, e.g. `3.2 ha`. */
export function formatHectares(value: number): string {
  return `${value.toLocaleString('en-US', { maximumFractionDigits: 1 })} ha`;
}

/** Format a carbon figure, e.g. `34.5 tCO₂e`. */
export function formatTonnes(value: number): string {
  return `${value.toLocaleString('en-US', { maximumFractionDigits: 1 })} tCO₂e`;
}
