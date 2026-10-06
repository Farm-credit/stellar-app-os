export type SponsorBadgeTier = 'bronze' | 'silver' | 'gold' | 'platinum';

export interface SponsorBadge {
  id: SponsorBadgeTier;
  name: string;
  description: string;
  threshold: number;
}

export type AchievementBadgeId = 'first-tree' | 'century-club' | 'millionaire' | 'explorer';

export interface AchievementBadge {
  id: AchievementBadgeId;
  name: string;
  description: string;
  category: 'sponsorship' | 'trees' | 'co2' | 'exploration';
  icon: string;
  threshold: number;
  metricUnit: string;
  unlockedMessage: string;
}

export interface SponsorshipMilestones {
  totalTreesSponsored: number;
  totalCO2OffsetKg: number;
  uniqueRegionsSponsored: number;
  userJoinDate?: string;
}

export interface AchievementBadgeProgress {
  badge: AchievementBadge;
  currentValue: number;
  threshold: number;
  progressPercent: number;
  isUnlocked: boolean;
  unlockedAt?: string | null;
}
