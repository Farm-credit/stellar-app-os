/**
 * Community forest leaderboard (Issue #1646).
 *
 * The ranking metric is *trees planted in the community forest* — the same
 * collective impact metric the milestone celebrations use, so the board and
 * the milestones never disagree.
 *
 * Ranking rules:
 * - Sponsors are ranked by trees planted, highest first.
 * - Sponsors with the same number of planted trees share a rank and the next
 *   rank is skipped (standard competition ranking: 1, 2, 2, 4), matching the
 *   team challenge board.
 * - Sponsors without any recorded contribution are still listed, with zero
 *   trees, so the board shows every participant of the project.
 * - Ties are broken deterministically by trees contributed, then by wallet,
 *   so the surfaced order never depends on the input order.
 */

import type { CommunityForestLeaderboardEntry } from './types';

export interface CommunityForestSponsorContribution {
  sponsorWallet: string;
  displayName?: string | null;
  /** Trees this sponsor has planted in the project — the ranking metric. */
  treesPlanted: number;
  /** Trees this sponsor contributed, including trees that are not planted yet. */
  treesContributed: number;
  /** Annual CO₂ sequestration of the planted trees, in kg. */
  co2KgPerYear?: number;
}

function toCount(value: number | null | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

function normalize(
  contribution: CommunityForestSponsorContribution
): CommunityForestSponsorContribution & { treesPlanted: number; treesContributed: number } {
  return {
    sponsorWallet: contribution.sponsorWallet,
    displayName: contribution.displayName ?? null,
    treesPlanted: toCount(contribution.treesPlanted),
    treesContributed: toCount(contribution.treesContributed),
    co2KgPerYear: toCount(contribution.co2KgPerYear),
  };
}

function compareContributions(
  a: CommunityForestSponsorContribution,
  b: CommunityForestSponsorContribution
): number {
  if (a.treesPlanted !== b.treesPlanted) return b.treesPlanted - a.treesPlanted;
  if (a.treesContributed !== b.treesContributed) {
    return b.treesContributed - a.treesContributed;
  }
  return a.sponsorWallet.localeCompare(b.sponsorWallet);
}

/**
 * Ranks the sponsors of a community forest. The input array is never mutated.
 */
export function rankCommunityForestSponsors(
  contributions: readonly CommunityForestSponsorContribution[]
): CommunityForestLeaderboardEntry[] {
  const normalized = contributions.map(normalize).sort(compareContributions);

  let previousPlanted: number | null = null;
  let previousRank = 0;

  const ranked = normalized.map((contribution, index) => {
    const tied = previousPlanted !== null && previousPlanted === contribution.treesPlanted;
    const rank = tied ? previousRank : index + 1;
    previousPlanted = contribution.treesPlanted;
    previousRank = rank;

    return {
      rank,
      sponsorWallet: contribution.sponsorWallet,
      displayName: contribution.displayName,
      treesPlanted: contribution.treesPlanted,
      treesContributed: contribution.treesContributed,
      co2KgPerYear: contribution.co2KgPerYear,
      isTied: false,
    };
  });

  // A sponsor is tied when another sponsor shares its number of planted trees.
  const countsByPlanted = new Map<number, number>();
  for (const entry of ranked) {
    countsByPlanted.set(entry.treesPlanted, (countsByPlanted.get(entry.treesPlanted) ?? 0) + 1);
  }

  return ranked.map((entry) => ({
    ...entry,
    isTied: (countsByPlanted.get(entry.treesPlanted) ?? 0) > 1,
  }));
}
