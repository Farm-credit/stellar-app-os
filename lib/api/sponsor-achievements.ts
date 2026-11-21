import { getSponsorProfile } from '@/lib/api/sponsors';
import { getSponsorPortfolio } from '@/lib/api/sponsor-portfolio';
import {
  evaluateSponsorAchievements,
  type SponsorAchievement,
} from '@/lib/gamification/sponsor-achievements';

/** Badges for a sponsor address, or undefined when the sponsor is unknown. */
export function getAchievementsForSponsor(address: string): SponsorAchievement[] | undefined {
  const profile = getSponsorProfile(address);
  if (!profile) return undefined;
  const { plantingHistory } = getSponsorPortfolio(profile.address, {
    totalTrees: profile.totalTrees,
    totalCo2OffsetTonnes: profile.co2Offset,
  });
  return evaluateSponsorAchievements(plantingHistory);
}

export function achievementImagePath(address: string, badgeId: string): string {
  return `/api/sponsors/${encodeURIComponent(address)}/badges/${badgeId}/image`;
}
