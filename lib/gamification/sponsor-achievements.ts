/**
 * Sponsor achievement badges — Issue #1687.
 *
 * Five milestone badges awarded automatically from a sponsor's planting
 * history: First Tree, 10 Trees, 100 Trees, Multi-Continent Forest and Rare
 * Species Sponsor. Pure functions, so the profile page, the API and the share
 * image all agree on who has earned what.
 */
import { isRareTreeSpecies } from '@/lib/gamification/sponsor-milestones';

export type SponsorAchievementId =
  'first-tree' | 'ten-trees' | 'hundred-trees' | 'multi-continent-forest' | 'rare-species-sponsor';

export interface SponsorAchievementDefinition {
  id: SponsorAchievementId;
  name: string;
  description: string;
  /** Short mark drawn on the share image. */
  emblem: string;
  /** What the sponsor must reach (trees, continents or rare trees). */
  target: number;
  unit: string;
}

export const MULTI_CONTINENT_TARGET = 2;

export const SPONSOR_ACHIEVEMENTS: readonly SponsorAchievementDefinition[] = [
  {
    id: 'first-tree',
    name: 'First Tree',
    description: 'Sponsored your first tree.',
    emblem: '1',
    target: 1,
    unit: 'trees',
  },
  {
    id: 'ten-trees',
    name: '10 Trees',
    description: 'Sponsored 10 trees.',
    emblem: '10',
    target: 10,
    unit: 'trees',
  },
  {
    id: 'hundred-trees',
    name: '100 Trees',
    description: 'Sponsored 100 trees.',
    emblem: '100',
    target: 100,
    unit: 'trees',
  },
  {
    id: 'multi-continent-forest',
    name: 'Multi-Continent Forest',
    description: `Sponsored trees on ${MULTI_CONTINENT_TARGET} or more continents.`,
    emblem: `${MULTI_CONTINENT_TARGET}+`,
    target: MULTI_CONTINENT_TARGET,
    unit: 'continents',
  },
  {
    id: 'rare-species-sponsor',
    name: 'Rare Species Sponsor',
    description: 'Sponsored a rare tree species.',
    emblem: 'R',
    target: 1,
    unit: 'rare trees',
  },
];

const CONTINENT_BY_COUNTRY: Record<string, string> = {
  // Africa
  nigeria: 'Africa',
  ghana: 'Africa',
  kenya: 'Africa',
  uganda: 'Africa',
  tanzania: 'Africa',
  ethiopia: 'Africa',
  rwanda: 'Africa',
  senegal: 'Africa',
  cameroon: 'Africa',
  zambia: 'Africa',
  malawi: 'Africa',
  madagascar: 'Africa',
  'south africa': 'Africa',
  'dr congo': 'Africa',
  // Asia
  india: 'Asia',
  indonesia: 'Asia',
  philippines: 'Asia',
  nepal: 'Asia',
  bangladesh: 'Asia',
  vietnam: 'Asia',
  thailand: 'Asia',
  // South America
  brazil: 'South America',
  peru: 'South America',
  colombia: 'South America',
  ecuador: 'South America',
  // North America
  mexico: 'North America',
  'costa rica': 'North America',
  guatemala: 'North America',
  haiti: 'North America',
  // Europe / Oceania
  spain: 'Europe',
  portugal: 'Europe',
  australia: 'Oceania',
};

/** Continent for a "Place, Country" region string, or null when unknown. */
export function continentForRegion(region: string): string | null {
  const country = region.split(',').pop()?.trim().toLowerCase() ?? '';
  return CONTINENT_BY_COUNTRY[country] ?? null;
}

export interface AchievementTreeInput {
  species: string;
  region: string;
  plantedAt: string;
}

export interface SponsorAchievement extends SponsorAchievementDefinition {
  earned: boolean;
  /** ISO date of the planting that unlocked the badge; null while locked. */
  earnedAt: string | null;
  /** Progress toward the target, capped at the target. */
  current: number;
}

/**
 * Evaluates all five badges for a sponsor, in display order.
 * Trees with an unreadable `plantedAt` are ignored.
 */
export function evaluateSponsorAchievements(
  trees: readonly AchievementTreeInput[]
): SponsorAchievement[] {
  const sorted = trees
    .filter((tree) => !Number.isNaN(new Date(tree.plantedAt).getTime()))
    .slice()
    .sort((a, b) => new Date(a.plantedAt).getTime() - new Date(b.plantedAt).getTime());

  const dateOfNthTree = (n: number): string | null =>
    sorted.length >= n ? new Date(sorted[n - 1].plantedAt).toISOString() : null;

  const continents = new Set<string>();
  let secondContinentAt: string | null = null;
  for (const tree of sorted) {
    const continent = continentForRegion(tree.region);
    if (!continent || continents.has(continent)) continue;
    continents.add(continent);
    if (continents.size === MULTI_CONTINENT_TARGET) {
      secondContinentAt = new Date(tree.plantedAt).toISOString();
    }
  }

  const rareTrees = sorted.filter((tree) => isRareTreeSpecies(tree.species));
  const firstRareAt = rareTrees[0] ? new Date(rareTrees[0].plantedAt).toISOString() : null;

  return SPONSOR_ACHIEVEMENTS.map((definition) => {
    let current = 0;
    let earnedAt: string | null = null;
    switch (definition.id) {
      case 'first-tree':
      case 'ten-trees':
      case 'hundred-trees':
        current = sorted.length;
        earnedAt = dateOfNthTree(definition.target);
        break;
      case 'multi-continent-forest':
        current = continents.size;
        earnedAt = secondContinentAt;
        break;
      case 'rare-species-sponsor':
        current = rareTrees.length;
        earnedAt = firstRareAt;
        break;
    }
    return {
      ...definition,
      earned: earnedAt !== null,
      earnedAt,
      current: Math.min(current, definition.target),
    };
  });
}

export function shareTextForAchievement(achievement: SponsorAchievementDefinition): string {
  return `I just earned the "${achievement.name}" badge for sponsoring trees with @StellarAppOS! 🌳 #TreeSponsor #ClimateAction`;
}
