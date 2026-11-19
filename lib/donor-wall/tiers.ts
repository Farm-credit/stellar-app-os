/**
 * Donor recognition tiers (Issue #1656).
 * Thresholds are the minimum total trees funded to reach a tier.
 */

export type DonorTierId = 'platinum' | 'gold' | 'silver' | 'bronze';

export interface DonorTier {
  id: DonorTierId;
  label: string;
  minTrees: number;
}

/** Ordered highest → lowest so the first match wins. */
export const DONOR_TIERS: readonly DonorTier[] = [
  { id: 'platinum', label: 'Platinum', minTrees: 1000 },
  { id: 'gold', label: 'Gold', minTrees: 200 },
  { id: 'silver', label: 'Silver', minTrees: 50 },
  { id: 'bronze', label: 'Bronze', minTrees: 10 },
];

/** Sponsors below this many trees do not appear on the wall. */
export const MIN_WALL_TREES = DONOR_TIERS[DONOR_TIERS.length - 1].minTrees;

export function getDonorTier(totalTrees: number): DonorTierId | null {
  return DONOR_TIERS.find((tier) => totalTrees >= tier.minTrees)?.id ?? null;
}
