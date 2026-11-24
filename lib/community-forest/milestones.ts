/**
 * Community forest milestone celebrations (Issue #1646).
 *
 * The thresholds follow the configuration pattern already used for sponsor
 * badges (`lib/gamification/sponsor-badges.ts`): a module level list of
 * thresholds with a human readable title. Every community forest celebrates
 * the same ladder, and the celebration itself is persisted per project so a
 * milestone is only ever celebrated once.
 *
 * The metric is *trees planted* — trees that are actually in the ground
 * (`planted`, `verified` or `completed`). Monetary contributions are never
 * converted into planted trees, because the platform has no conversion rule
 * for that.
 */

import type {
  CommunityForestMilestoneCelebration,
  CommunityForestMilestoneProgress,
  CommunityForestMilestoneThreshold,
} from './types';

/** Tree lifecycle statuses that mean the tree is in the ground. */
export const PLANTED_TREE_STATUSES = ['planted', 'verified', 'completed'] as const;

/** The configured milestone ladder every community forest celebrates. */
export const COMMUNITY_FOREST_MILESTONE_THRESHOLDS: readonly CommunityForestMilestoneThreshold[] =
  [
    { thresholdTrees: 100, title: '100 trees planted' },
    { thresholdTrees: 500, title: '500 trees planted' },
    { thresholdTrees: 1000, title: '1,000 trees planted' },
    { thresholdTrees: 5000, title: '5,000 trees planted' },
    { thresholdTrees: 10000, title: '10,000 trees planted' },
  ];

function toTreeCount(value: number | null | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

/** Every configured threshold the project has reached, lowest first. */
export function getReachedMilestoneThresholds(
  plantedTrees: number
): CommunityForestMilestoneThreshold[] {
  const planted = toTreeCount(plantedTrees);
  return COMMUNITY_FOREST_MILESTONE_THRESHOLDS.filter(
    (threshold) => planted >= threshold.thresholdTrees
  );
}

/**
 * Thresholds that have been reached but not celebrated yet. Used to trigger
 * celebrations after a contribution — several thresholds can be crossed by a
 * single update and none of them may be skipped.
 */
export function getUncelebratedMilestoneThresholds(
  plantedTrees: number,
  celebratedThresholds: readonly number[]
): CommunityForestMilestoneThreshold[] {
  const celebrated = new Set(celebratedThresholds);
  return getReachedMilestoneThresholds(plantedTrees).filter(
    (threshold) => !celebrated.has(threshold.thresholdTrees)
  );
}

/** The next threshold to celebrate, or `null` when the ladder is complete. */
export function getNextMilestoneThreshold(
  plantedTrees: number,
  celebratedThresholds: readonly number[]
): CommunityForestMilestoneThreshold | null {
  const celebrated = new Set(celebratedThresholds);
  const planted = toTreeCount(plantedTrees);

  return (
    COMMUNITY_FOREST_MILESTONE_THRESHOLDS.find(
      (threshold) =>
        threshold.thresholdTrees > planted && !celebrated.has(threshold.thresholdTrees)
    ) ?? null
  );
}

/**
 * Builds the milestone panel of the community forest dashboard: the
 * configured ladder, the milestones already celebrated, the next milestone and
 * the progress towards it.
 */
export function buildMilestoneProgress(
  plantedTrees: number,
  celebrated: readonly CommunityForestMilestoneCelebration[]
): CommunityForestMilestoneProgress {
  const planted = toTreeCount(plantedTrees);
  const celebratedThresholds = celebrated.map((milestone) => milestone.thresholdTrees);
  const next = getNextMilestoneThreshold(planted, celebratedThresholds);

  let progressPercent = 100;
  let treesToNext = 0;

  if (next) {
    const previous = [...COMMUNITY_FOREST_MILESTONE_THRESHOLDS]
      .reverse()
      .find((threshold) => threshold.thresholdTrees < next.thresholdTrees);
    const bandStart = previous ? previous.thresholdTrees : 0;
    const bandSize = next.thresholdTrees - bandStart;
    const progressed = Math.min(Math.max(planted - bandStart, 0), bandSize);
    progressPercent = bandSize > 0 ? Math.round((progressed / bandSize) * 100) : 0;
    treesToNext = Math.max(next.thresholdTrees - planted, 0);
  }

  return {
    thresholds: [...COMMUNITY_FOREST_MILESTONE_THRESHOLDS],
    celebrated: [...celebrated].sort((a, b) => b.thresholdTrees - a.thresholdTrees),
    next,
    treesToNext,
    progressPercent,
  };
}
