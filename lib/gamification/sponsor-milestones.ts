import type { TreeSpecies } from '@/lib/types/tree';

export type SponsorMilestoneType = 'tenth_tree' | 'one_year_anniversary' | 'first_rare_species';

export interface SponsorMilestone {
  id: SponsorMilestoneType;
  title: string;
  description: string;
  /** ISO timestamp of when the milestone was reached. */
  achievedAt: string;
  /** Pre-filled social post text. */
  shareText: string;
}

export interface MilestoneTreeInput {
  species: TreeSpecies | string;
  plantedAt: string;
}

/** Species treated as "rare" for the first-rare-species milestone. */
export const RARE_TREE_SPECIES: readonly string[] = ['Baobab', 'Iroko', 'African Mahogany'];

export const TENTH_TREE_COUNT = 10;

export function isRareTreeSpecies(species: string): boolean {
  return RARE_TREE_SPECIES.some((rare) => rare.toLowerCase() === species.toLowerCase());
}

function addOneYear(iso: string): Date {
  const date = new Date(iso);
  date.setUTCFullYear(date.getUTCFullYear() + 1);
  return date;
}

/**
 * Derives the milestones a sponsor has reached, newest first.
 * Pure function: `now` is injectable for deterministic results.
 */
export function getSponsorMilestones(
  trees: readonly MilestoneTreeInput[],
  now: Date = new Date()
): SponsorMilestone[] {
  const sorted = trees
    .filter((tree) => !Number.isNaN(new Date(tree.plantedAt).getTime()))
    .slice()
    .sort((a, b) => new Date(a.plantedAt).getTime() - new Date(b.plantedAt).getTime());

  const milestones: SponsorMilestone[] = [];

  if (sorted.length >= TENTH_TREE_COUNT) {
    milestones.push({
      id: 'tenth_tree',
      title: '10th tree sponsored',
      description: 'You reached 10 sponsored trees.',
      achievedAt: new Date(sorted[TENTH_TREE_COUNT - 1].plantedAt).toISOString(),
      shareText:
        'I just sponsored my 10th tree with @StellarAppOS! 🌳 Every tree counts for a greener planet. #TreeSponsor #ClimateAction',
    });
  }

  if (sorted.length > 0) {
    const anniversary = addOneYear(sorted[0].plantedAt);
    if (anniversary.getTime() <= now.getTime()) {
      milestones.push({
        id: 'one_year_anniversary',
        title: '1-year sponsor anniversary',
        description: 'One year since you sponsored your first tree.',
        achievedAt: anniversary.toISOString(),
        shareText:
          "It's been a year since I sponsored my first tree with @StellarAppOS! 🎉 Proud to keep growing a greener future. #TreeSponsor #ClimateAction",
      });
    }
  }

  const firstRare = sorted.find((tree) => isRareTreeSpecies(tree.species));
  if (firstRare) {
    milestones.push({
      id: 'first_rare_species',
      title: 'First rare species sponsored',
      description: `You sponsored your first rare species: ${firstRare.species}.`,
      achievedAt: new Date(firstRare.plantedAt).toISOString(),
      shareText: `I just sponsored my first rare species tree (${firstRare.species}) with @StellarAppOS! 🌍 Helping protect biodiversity. #TreeSponsor #Biodiversity`,
    });
  }

  return milestones.sort(
    (a, b) => new Date(b.achievedAt).getTime() - new Date(a.achievedAt).getTime()
  );
}
