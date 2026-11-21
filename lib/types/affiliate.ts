/**
 * Type definitions for the Affiliate / Partnership program (Issue #1153).
 *
 * Partners and influencers earn a 10–25% revenue share commission on the
 * contributions of sponsors they refer to the platform.
 */

export type AffiliateTierId = 'starter' | 'growth' | 'pro' | 'enterprise';

/** A commission band a partner qualifies for based on referred-sponsor volume. */
export interface AffiliateCommissionTier {
  id: AffiliateTierId;
  name: string;
  /** Commission rate as a whole percentage (10 / 15 / 20 / 25). */
  commissionRate: number;
  /** Minimum monthly referred-sponsor contribution (USDC) for this tier. */
  monthlyVolumeMinUsdc: number;
  /** Upper bound of the band, or null for the top tier. */
  monthlyVolumeMaxUsdc: number | null;
  perks: string[];
}

export type AffiliateReferralStatus = 'pending' | 'eligible' | 'paid';

export type AffiliateReferralSource = 'partner' | 'influencer';

/** A single sponsor referred by a partner / influencer. */
export interface AffiliateReferral {
  id: string;
  sponsorName: string;
  /** ISO date the referred sponsor joined. */
  joinedAt: string;
  /** Total contributions from this referred sponsor in USDC. */
  contributedUsdc: number;
  /** Commission earned (USDC) attributed to this referral. */
  earnedUsdc: number;
  status: AffiliateReferralStatus;
  source: AffiliateReferralSource;
}

export interface AffiliateStats {
  /** The commission tier the partner currently qualifies for. */
  tier: AffiliateCommissionTier;
  /** Number of sponsors referred to date. */
  totalSponsorsReferred: number;
  /** Total contributions by referred sponsors in USDC. */
  totalContributionsUsdc: number;
  /** Running total commission earned in USDC. */
  totalEarnedUsdc: number;
  /** Commission accrued but not yet paid out. */
  pendingPayoutUsdc: number;
  /** Total commission already paid out. */
  paidOutUsdc: number;
  /** Referred-sponsor contribution volume this month (drives tier). */
  thisMonthContributionsUsdc: number;
  /** The partner's unique tracking link. */
  referralLink: string;
}

/** Full payload returned by the affiliate program API. */
export interface AffiliateProgramInfo {
  stats: AffiliateStats;
  tiers: AffiliateCommissionTier[];
  /** Recent referred sponsors, newest first. */
  referrals: AffiliateReferral[];
}
