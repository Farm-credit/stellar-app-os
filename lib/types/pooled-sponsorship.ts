/**
 * Pooled Sponsorship types
 *
 * Multiple sponsors can pool funds to co-fund a single large tree together.
 * Revenue (carbon credits) and costs are split proportionally to each sponsor's
 * contribution as a percentage of the total pool target.
 */

export type PoolStatus = 'open' | 'funded' | 'planting' | 'completed' | 'cancelled';

/** One sponsor's stake in a pool */
export interface PoolSponsor {
  /** Stellar public key of the sponsor */
  sponsorAddress: string;
  /** Optional display name */
  sponsorName?: string;
  /** Amount contributed in USDC */
  contributionUsdc: number;
  /** Proportion of the pool (0–1) derived from contribution / totalFunded */
  sharePercent: number;
  /** ISO date of contribution */
  contributedAt: string;
  /** TREE / carbon credits allocated proportionally once pool completes */
  creditsAllocated: number;
}

/** A pooled sponsorship for a single tree slot */
export interface PooledSponsorship {
  poolId: string;
  treeRef: string;
  species: string;
  region: string;
  /** Total USDC required to fully fund this tree */
  targetUsdc: number;
  /** Sum of all sponsor contributions so far */
  totalFundedUsdc: number;
  /** Remaining amount needed */
  remainingUsdc: number;
  /** Percentage of pool filled (0–100) */
  fillPercent: number;
  status: PoolStatus;
  sponsors: PoolSponsor[];
  createdAt: string;
  completedAt?: string;
}

/** Request body for creating a new pool */
export interface CreatePoolRequest {
  treeRef: string;
  species: string;
  region: string;
  targetUsdc: number;
  /** Address of the first sponsor (creator) */
  sponsorAddress: string;
  /** Initial contribution — can be 0 to just open the pool */
  contributionUsdc: number;
  sponsorName?: string;
}

/** Request body for joining / adding funds to a pool */
export interface JoinPoolRequest {
  poolId: string;
  sponsorAddress: string;
  contributionUsdc: number;
  sponsorName?: string;
}

/** Proportional revenue / credit split result */
export interface PoolCreditSplit {
  poolId: string;
  totalCredits: number;
  splits: {
    sponsorAddress: string;
    sharePercent: number;
    creditsAllocated: number;
    co2OffsetKg: number;
  }[];
}

/** Summary returned by GET /api/pools/:poolId */
export type PoolSummary = PooledSponsorship;
