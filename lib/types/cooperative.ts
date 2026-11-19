/**
 * Type definitions for farmer cooperatives & collective bargaining — Issue #1431
 *
 * A cooperative is a group of farmer/seller accounts that pool marketplace
 * projects so they can negotiate volume-based pricing with buyers together.
 */

import type { ProjectType, VerificationStatus } from '@/lib/types/carbon';

/** Role a member holds inside a cooperative. */
export type CooperativeRole = 'founder' | 'admin' | 'member';

/** Lifecycle of a cooperative. */
export type CooperativeStatus = 'forming' | 'active' | 'suspended';

/** Member of a cooperative. */
export interface CooperativeMember {
  userId: string;
  name: string;
  role: CooperativeRole;
  walletAddress?: string;
  joinedAt: string;
  /** Total tonnes this member has contributed to the shared pool. */
  contributedTons: number;
}

/**
 * A marketplace project (carbon-credit listing) contributed to the shared pool.
 * The same project can be contributed by several members — every contribution is
 * kept as its own row so the pool stays auditable.
 */
export interface PooledProject {
  id: string;
  projectId: string;
  projectName: string;
  projectType: ProjectType;
  contributedBy: string;
  quantityTons: number;
  pricePerTon: number;
  verificationStatus: VerificationStatus;
  contributedAt: string;
}

/** A step on the cooperative volume-discount curve. */
export interface DiscountTier {
  minTons: number;
  discountPercent: number;
}

/** Result of evaluating the pool's collective bargaining position. */
export interface CollectiveBargainingTerms {
  /** Total tonnes pooled across all members. */
  pooledQuantityTons: number;
  memberCount: number;
  minMembersToBargain: number;
  meetsMemberMinimum: boolean;
  /** Tier reached for the evaluated quantity (null when nothing is pooled). */
  tier: DiscountTier | null;
  discountPercent: number;
  /** Weighted average list price across pooled contributions. */
  blendedPricePerTon: number;
  /** Blended price after the collective discount is applied. */
  effectivePricePerTon: number;
  estimatedTotal: number;
  estimatedSavings: number;
  /** Tonnes still required to unlock the next tier (null at the top tier). */
  missingTonsForNextTier: number | null;
}

/** Buyer-side offer made to a cooperative. */
export interface BuyerOffer {
  buyerId: string;
  buyerName: string;
  pricePerTon: number;
  quantityTons: number;
  terms?: string;
  submittedAt: string;
}

export type BargainingRoundStatus =
  | 'open'
  | 'offer_received'
  | 'accepted'
  | 'rejected'
  | 'expired';

export type BargainingVoteChoice = 'accept' | 'reject';

export interface BargainingVote {
  memberId: string;
  vote: BargainingVoteChoice;
  votedAt: string;
}

/** A single negotiation round between the cooperative and a buyer. */
export interface BargainingRound {
  id: string;
  cooperativeId: string;
  targetQuantityTons: number;
  status: BargainingRoundStatus;
  offer: BuyerOffer | null;
  votes: BargainingVote[];
  deadline: string;
  createdAt: string;
  resolvedAt: string | null;
}

/** Aggregate cooperative record. */
export interface Cooperative {
  id: string;
  name: string;
  description: string;
  region: string;
  status: CooperativeStatus;
  founderId: string;
  members: CooperativeMember[];
  pooledProjects: PooledProject[];
  bargainingRounds: BargainingRound[];
  minMembersToBargain: number;
  bargainingQuorumPercent: number;
  createdAt: string;
  updatedAt: string;
}

/** Lightweight cooperative shape returned by list endpoints. */
export interface CooperativeSummary {
  id: string;
  name: string;
  description: string;
  region: string;
  status: CooperativeStatus;
  founderId: string;
  memberCount: number;
  minMembersToBargain: number;
  meetsMemberMinimum: boolean;
  pooledProjectCount: number;
  pooledQuantityTons: number;
  discountPercent: number;
  openBargainingRounds: number;
  createdAt: string;
  updatedAt: string;
}

// ── Input contracts ───────────────────────────────────────────────────────────

export interface CreateCooperativeInput {
  name: string;
  description?: string;
  region?: string;
  founderId: string;
  founderName?: string;
  walletAddress?: string;
  minMembersToBargain?: number;
  bargainingQuorumPercent?: number;
}

export interface AddMemberInput {
  userId: string;
  name?: string;
  role?: CooperativeRole;
  walletAddress?: string;
}

export interface AddPooledProjectInput {
  projectId: string;
  contributorId: string;
  quantityTons: number;
}

export interface CreateBargainingRoundInput {
  targetQuantityTons?: number;
  deadlineHours?: number;
}

export interface SubmitBuyerOfferInput {
  buyerId: string;
  buyerName?: string;
  pricePerTon: number;
  quantityTons: number;
  terms?: string;
}

export interface VoteOnOfferInput {
  memberId: string;
  vote: BargainingVoteChoice;
}

export interface ListCooperativesFilter {
  region?: string;
  status?: CooperativeStatus;
  search?: string;
  memberId?: string;
}
