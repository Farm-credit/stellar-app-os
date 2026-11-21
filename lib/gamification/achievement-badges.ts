import type {
  AchievementBadge,
  SponsorshipMilestones,
  AchievementBadgeProgress,
  AchievementBadgeId,
} from '@/lib/types/sponsor-badge';

export const ACHIEVEMENT_BADGES: readonly AchievementBadge[] = [
  {
    id: 'first-tree',
    name: 'First Tree',
    description: 'Sponsored your first tree to launch your reforestation journey.',
    category: 'sponsorship',
    icon: '🌱',
    threshold: 1,
    metricUnit: 'trees',
    unlockedMessage: 'Welcome to the reforestation movement!',
  },
  {
    id: 'century-club',
    name: 'Century Club',
    description: 'Sponsored 100 or more trees for large-scale forest recovery.',
    category: 'trees',
    icon: '🌳',
    threshold: 100,
    metricUnit: 'trees',
    unlockedMessage: 'You are now a member of the elite Century Club!',
  },
  {
    id: 'millionaire',
    name: 'Millionaire',
    description: 'Achieved 1,000,000 kg (1,000 metric tons) of total lifetime CO₂ offset.',
    category: 'co2',
    icon: '💎',
    threshold: 1000000,
    metricUnit: 'kg CO₂',
    unlockedMessage: 'Climate Hero! You offset 1,000,000 kg of atmospheric CO₂.',
  },
  {
    id: 'explorer',
    name: 'Explorer',
    description: 'Sponsored trees across 5 or more unique geographic regions worldwide.',
    category: 'exploration',
    icon: '🌍',
    threshold: 5,
    metricUnit: 'regions',
    unlockedMessage: 'Global Impact Pioneer! Sponsored trees in 5+ regions.',
  },
];

/**
 * Calculates unlock status and progress percentage for all achievement badges based on user milestones
 */
export function getAchievementBadgeProgress(
  milestones: SponsorshipMilestones
): AchievementBadgeProgress[] {
  return ACHIEVEMENT_BADGES.map((badge) => {
    let currentValue = 0;

    switch (badge.id) {
      case 'first-tree':
      case 'century-club':
        currentValue = milestones.totalTreesSponsored || 0;
        break;
      case 'millionaire':
        currentValue = milestones.totalCO2OffsetKg || 0;
        break;
      case 'explorer':
        currentValue = milestones.uniqueRegionsSponsored || 0;
        break;
    }

    const isUnlocked = currentValue >= badge.threshold;
    const progressPercent = Math.min(100, Math.round((currentValue / badge.threshold) * 100));

    return {
      badge,
      currentValue,
      threshold: badge.threshold,
      progressPercent,
      isUnlocked,
      unlockedAt: isUnlocked ? '2026-08-01T12:00:00Z' : null,
    };
  });
}

/**
 * Returns unlocked achievement badges for a given user milestone profile
 */
export function getUnlockedAchievementBadges(
  milestones: SponsorshipMilestones
): AchievementBadgeProgress[] {
  return getAchievementBadgeProgress(milestones).filter((item) => item.isUnlocked);
}

/**
 * Check if a specific achievement badge is unlocked
 */
export function hasUnlockedBadge(
  milestones: SponsorshipMilestones,
  badgeId: AchievementBadgeId
): boolean {
  const progressList = getAchievementBadgeProgress(milestones);
  const found = progressList.find((item) => item.badge.id === badgeId);
  return found?.isUnlocked ?? false;
}
