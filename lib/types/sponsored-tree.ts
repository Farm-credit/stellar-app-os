/**
 * Types for the sponsored-tree map feature — Issue #1619.
 *
 * A SponsoredTree is a Tree with verified sponsor attribution.
 * Only trees with an on-chain mint (nftTokenId) and a known sponsor
 * organisation name qualify.
 */

import type { Tree, TreeSpecies } from '@/lib/types/tree';

/**
 * A tree that has been sponsored by a named organisation.
 * Extends Tree with required sponsor fields.
 */
export interface SponsoredTree extends Tree {
  /** Stable identifier of the sponsor (e.g. 'sp-acme'). */
  sponsorId: string;
  /** Public display name of the sponsoring organisation. */
  sponsorName: string;
}

/** Filters specific to the sponsored-tree map. */
export interface SponsoredTreeFilters {
  species: TreeSpecies | 'all';
  plantingYear: number | 'all';
  sponsor: string | 'all';
}

/** Available filter options derived from the sponsored tree dataset. */
export interface SponsoredTreeFilterOptions {
  species: TreeSpecies[];
  plantingYears: number[];
  sponsors: Array<{ id: string; name: string }>;
}

/** Response shape for the sponsored-tree data fetch. */
export interface SponsoredTreesResponse {
  trees: SponsoredTree[];
  filterOptions: SponsoredTreeFilterOptions;
  totalCount: number;
}
