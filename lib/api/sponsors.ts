import { mockAllTimeSponsors } from '@/lib/api/mock/leaderboard';
import type { SponsorBadge } from '@/lib/types/sponsor-badge';
import { getSponsorBadges } from '@/lib/gamification/sponsor-badges';

export interface SponsorProfile {
  address: string;
  name?: string;
  avatarUrl?: string;
  totalTrees: number;
  co2Offset: number;
  badges: SponsorBadge[];
}

export function getSponsorProfile(address: string): SponsorProfile | undefined {
  const sponsor = mockAllTimeSponsors.find(
    (entry) => entry.address.toLowerCase() === address.toLowerCase()
  );

  if (!sponsor) return undefined;

  return {
    ...sponsor,
    badges: getSponsorBadges(sponsor.totalTrees),
  };
}
