/**
 * Community forest projects — pooled sponsorship with shared impact
 * (Issue #1646).
 *
 * A community forest is a *named* project that several sponsors contribute to
 * together. It always sits on top of an existing project from the platform
 * catalogue (the "base project"), so the platform keeps a single project
 * concept: the base project owns the type, location, description and
 * verification status, while the community forest adds the pooled
 * sponsorship layer (participants, collective impact, group leaderboard and
 * milestone celebrations) on top of it.
 *
 * Sponsors are Stellar wallets, exactly like everywhere else in the app
 * (`trees.sponsor_wallet`, `sponsor_team_members.wallet`, `sponsor_cohorts.wallet`).
 */

/** Who created — and therefore owns — a community forest project. */
export type CommunityForestCreatorKind = 'admin' | 'organisation';

/** Lifecycle of a community forest project. */
export type CommunityForestStatus = 'active' | 'archived';

/** Role a sponsor holds inside a community forest. */
export type CommunityForestMemberRole = 'creator' | 'sponsor';

/** The metric the community forest leaderboard ranks by. */
export type CommunityForestLeaderboardMetric = 'trees_planted';

/** A community forest project. */
export interface CommunityForestProject {
  id: string;
  name: string;
  description: string | null;
  /** Id of the platform project this community forest grows from. */
  baseProjectId: string;
  createdByKind: CommunityForestCreatorKind;
  /** Partner organisation id, or the platform admin marker. */
  createdById: string;
  status: CommunityForestStatus;
  createdAt: string;
  updatedAt: string;
}

/** A sponsor taking part in a community forest. */
export interface CommunityForestMember {
  sponsorWallet: string;
  displayName: string | null;
  role: CommunityForestMemberRole;
  joinedAt: string;
}

/** Aggregate collective impact of a community forest. */
export interface CommunityForestImpact {
  /** Trees contributed to the project, whatever their lifecycle status. */
  totalTrees: number;
  /** Trees that are actually in the ground (planted, verified or completed). */
  plantedTrees: number;
  /** Trees that are funded but not planted yet. */
  fundedTrees: number;
  /** Annual CO₂ sequestration of the planted trees, in kg. */
  co2KgPerYear: number;
  /** Sponsors taking part in the project. */
  sponsorCount: number;
}

/** One row of the community forest leaderboard. */
export interface CommunityForestLeaderboardEntry {
  rank: number;
  sponsorWallet: string;
  displayName: string | null;
  /** Trees this sponsor has planted in the project — the ranking metric. */
  treesPlanted: number;
  /** Trees this sponsor contributed, including trees that are not planted yet. */
  treesContributed: number;
  co2KgPerYear: number;
  /** True when another sponsor shares this rank. */
  isTied: boolean;
}

/** A configured milestone threshold, expressed in trees planted. */
export interface CommunityForestMilestoneThreshold {
  thresholdTrees: number;
  title: string;
}

/** A milestone that has been celebrated for a community forest. */
export interface CommunityForestMilestoneCelebration {
  thresholdTrees: number;
  title: string;
  treesAtCelebration: number;
  celebratedAt: string;
}

/** Progress towards the next configured milestone. */
export interface CommunityForestMilestoneProgress {
  thresholds: CommunityForestMilestoneThreshold[];
  celebrated: CommunityForestMilestoneCelebration[];
  /** Next milestone to reach, or `null` when every threshold is celebrated. */
  next: CommunityForestMilestoneThreshold | null;
  /** Trees still needed for the next milestone (0 when there is none). */
  treesToNext: number;
  /** Progress towards the next milestone, 0-100. */
  progressPercent: number;
}
