import type { SponsorBadge, SponsorBadgeTier } from '@/lib/types/sponsor-badge';

export const SPONSOR_BADGES: readonly SponsorBadge[] = [
  {
    id: 'bronze',
    name: 'Bronze Sponsor',
    description: 'Sponsored at least 1 tree.',
    threshold: 1,
  },
  {
    id: 'silver',
    name: 'Silver Sponsor',
    description: 'Sponsored at least 10 trees.',
    threshold: 10,
  },
  {
    id: 'gold',
    name: 'Gold Sponsor',
    description: 'Sponsored at least 50 trees.',
    threshold: 50,
  },
  {
    id: 'platinum',
    name: 'Platinum Sponsor',
    description: 'Sponsored at least 100 trees.',
    threshold: 100,
  },
];

export function getSponsorBadges(totalTrees: number): SponsorBadge[] {
  const safeTreeCount = Number.isFinite(totalTrees) ? Math.max(0, totalTrees) : 0;
  return SPONSOR_BADGES.filter((badge) => safeTreeCount >= badge.threshold);
}

export function getHighestSponsorBadge(totalTrees: number): SponsorBadge | null {
  const badges = getSponsorBadges(totalTrees);
  return badges.at(-1) ?? null;
}

export function hasSponsorBadge(totalTrees: number, tier: SponsorBadgeTier): boolean {
  return getSponsorBadges(totalTrees).some((badge) => badge.id === tier);
}
