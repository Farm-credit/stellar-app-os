/**
 * Daily challenges gamification types.
 * Issue #1158 — Daily challenges encouraging sponsors to engage and earn bonus XLM.
 */

// ── Constants ───────────────────────────────────────────────────────────────

export type ChallengeType =
  | 'plant_trees'
  | 'sponsor_rare_species'
  | 'sponsor_new_region'
  | 'sponsor_consecutive_days'
  | 'sponsor_bulk'
  | 'referral'
  | 'carbon_milestone';

export type ChallengeDifficulty = 'easy' | 'medium' | 'hard' | 'epic';

export type ChallengeStatus = 'assigned' | 'in_progress' | 'completed' | 'expired' | 'claimed';

export type RewardType = 'xlm' | 'nft' | 'badge' | 'multiplier';

/** Base reward amounts by difficulty (before streak multiplier). */
export const BASE_REWARDS: Record<ChallengeDifficulty, number> = {
  easy: 0.5,
  medium: 2,
  hard: 5,
  epic: 15,
} as const;

// ── Database row types ──────────────────────────────────────────────────────

export interface DailyChallengeRow {
  id: number;
  slug: string;
  title: string;
  description: string;
  challenge_type: ChallengeType;
  target_value: number;
  reward_xlm: string; // NUMERIC
  reward_nft: boolean;
  badge_id: string | null;
  species_slug: string | null;
  region: string | null;
  difficulty: ChallengeDifficulty;
  active: boolean;
  start_date: string | null; // DATE
  end_date: string | null;
  created_at: Date;
}

export interface SponsorDailyChallengeRow {
  id: number;
  wallet: string;
  challenge_id: number;
  assigned_date: string; // DATE
  progress: number;
  target: number;
  status: ChallengeStatus;
  completed_at: Date | null;
  claimed_at: Date | null;
  created_at: Date;
}

export interface ChallengeRewardRow {
  id: number;
  wallet: string;
  challenge_id: number;
  sponsor_challenge_id: number;
  reward_type: RewardType;
  reward_amount: string; // NUMERIC
  reward_description: string | null;
  tx_hash: string | null;
  claimed: boolean;
  claimed_at: Date | null;
  created_at: Date;
}

export interface SponsorStreakRow {
  wallet: string;
  current_streak: number;
  longest_streak: number;
  last_active_date: string | null; // DATE
  streak_multiplier: string; // NUMERIC
  updated_at: Date;
}

// ── API response types ──────────────────────────────────────────────────────

export interface DailyChallengeCard {
  id: number;
  slug: string;
  title: string;
  description: string;
  challenge_type: ChallengeType;
  difficulty: ChallengeDifficulty;
  target: number;
  progress: number;
  progress_pct: number;
  status: ChallengeStatus;
  reward_xlm: number;
  reward_nft: boolean;
  streak_multiplier: number;
  effective_reward: number; // reward_xlm * streak_multiplier
  species_slug: string | null;
  region: string | null;
}

export interface DailyChallengesResponse {
  date: string; // "2025-08-30"
  challenges: DailyChallengeCard[];
  streak: StreakSummary;
  today_completed: number;
  today_total: number;
  today_earned_xlm: number;
  total_unclaimed_xlm: number;
}

export interface StreakSummary {
  current_streak: number;
  longest_streak: number;
  streak_multiplier: number;
  days_until_next_bonus: number; // days until next multiplier tier
}

export interface ClaimRewardInput {
  wallet: string;
  sponsor_challenge_id: number;
}

export interface ClaimRewardResult {
  reward_id: number;
  reward_type: RewardType;
  reward_amount: number;
  tx_hash: string | null;
}

export interface TrackProgressInput {
  wallet: string;
  challenge_type: ChallengeType;
  /** Increment value (e.g., number of trees sponsored). */
  increment: number;
  /** Optional species slug for species-specific challenges. */
  species_slug?: string;
  /** Optional region for region-specific challenges. */
  region?: string;
}

export interface ChallengeHistoryEntry {
  date: string;
  challenges_completed: number;
  xlm_earned: number;
}
