/**
 * TypeScript row types for the trees / planters / progress_updates / disputes
 * schema introduced in migrations 003–006.
 *
 * These are plain data-transfer types (no ORM). Column names match the SQL
 * schema exactly. Use `getPool().query(...)` from @/lib/db/client to query.
 *
 * Closes #546
 */

// ── Planters (migration 003) ──────────────────────────────────────────────────

export type KycStatus = 'pending' | 'verified' | 'rejected' | 'suspended';

export interface PlanterRow {
  id: number;
  stellar_address: string;
  full_name: string;
  country_code: string;
  region: string;
  lat: string | null; // NUMERIC returned as string by pg driver
  lng: string | null;
  phone_e164: string | null;
  kyc_status: KycStatus;
  identity_hash: string | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

// ── Trees (migration 004) ─────────────────────────────────────────────────────

export type TreeStatus = 'funded' | 'planted' | 'verified' | 'completed' | 'failed';

export interface TreeRow {
  id: number;
  contract_address: string;
  token_id: number;
  tree_ref: string;
  planter_id: number | null;
  species_slug: string | null;
  lat: string; // NUMERIC
  lng: string;
  region: string;
  country_code: string;
  status: TreeStatus;
  escrow_account: string | null;
  funding_tx_hash: string | null;
  planted_at: Date | null;
  verified_at: Date | null;
  completed_at: Date | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

// ── Progress Updates (migration 005) ─────────────────────────────────────────

export type UpdateType =
  'status_change' | 'photo_submitted' | 'gps_ping' | 'survival_check' | 'note';

export interface ProgressUpdateRow {
  id: number;
  tree_id: number;
  paging_token: string;
  update_type: UpdateType;
  from_status: TreeStatus | null;
  to_status: TreeStatus | null;
  lat: string | null;
  lng: string | null;
  media_url: string | null;
  ipfs_cid: string | null;
  metadata: Record<string, unknown>;
  submitted_by: string | null;
  created_at: Date;
}

// ── Disputes (migration 006) ──────────────────────────────────────────────────

export type DisputeStatus = 'open' | 'under_review' | 'resolved' | 'escalated' | 'closed';

export type DisputeCategory =
  | 'planting_fraud'
  | 'survival_failure'
  | 'escrow_release'
  | 'gps_mismatch'
  | 'admin_error'
  | 'other';

export interface DisputeRow {
  id: number;
  tree_id: number;
  raised_by: string;
  category: DisputeCategory;
  description: string;
  evidence_url: string | null;
  evidence_ipfs_cid: string | null;
  status: DisputeStatus;
  assigned_to: string | null;
  resolution_notes: string | null;
  resolution_tx_hash: string | null;
  created_at: Date;
  updated_at: Date;
  resolved_at: Date | null;
}

// ── Sponsor Cohorts (migration 011) ──────────────────────────────────────────

export interface SponsorCohortRow {
  wallet: string;
  first_sponsorship_at: Date;
  cohort_month: Date;
  total_sponsorships: number;
  total_trees: number;
  total_xlm: string;
  created_at: Date;
  updated_at: Date;
}

export interface SponsorshipEventRow {
  id: number;
  wallet: string;
  tree_id: number | null;
  trees_funded: number;
  xlm_amount: string;
  tx_hash: string | null;
  funded_at: Date;
  cohort_month: Date;
  metadata: Record<string, unknown>;
  created_at: Date;
}

export interface CohortRetentionRow {
  id: number;
  cohort_month: Date;
  period_month: Date;
  period_offset: number;
  cohort_size: number;
  retained_count: number;
  retention_pct: string;
  total_xlm: string;
  generated_at: Date;
}

// ── School Partnerships (migration 012) ──────────────────────────────────────

export type SchoolTier = 'standard' | 'bronze' | 'silver' | 'gold';
export type BatchStatus = 'open' | 'funded' | 'completed' | 'cancelled';

export interface SchoolPartnershipRow {
  id: number;
  school_name: string;
  contact_name: string;
  contact_email: string;
  contact_wallet: string | null;
  country_code: string;
  city: string | null;
  student_count: number;
  tier: SchoolTier;
  discount_pct: string;
  active: boolean;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

export interface SchoolPartnershipMemberRow {
  id: number;
  partnership_id: number;
  wallet: string;
  student_name: string | null;
  grade: string | null;
  enrolled_at: Date;
}

export interface SchoolSponsorshipBatchRow {
  id: number;
  partnership_id: number;
  project_name: string;
  description: string | null;
  target_trees: number;
  trees_funded: number;
  total_xlm: string;
  discount_pct: string;
  status: BatchStatus;
  created_by: string;
  created_at: Date;
  updated_at: Date;
  completed_at: Date | null;
}

export interface SchoolBatchContributionRow {
  id: number;
  batch_id: number;
  member_id: number | null;
  wallet: string;
  trees_funded: number;
  xlm_amount: string;
  tx_hash: string | null;
  contributed_at: Date;
}

// ── Daily Challenges (migration 013) ─────────────────────────────────────────

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

export interface DailyChallengeRow {
  id: number;
  slug: string;
  title: string;
  description: string;
  challenge_type: ChallengeType;
  target_value: number;
  reward_xlm: string;
  reward_nft: boolean;
  badge_id: string | null;
  species_slug: string | null;
  region: string | null;
  difficulty: ChallengeDifficulty;
  active: boolean;
  start_date: string | null;
  end_date: string | null;
  created_at: Date;
}

export interface SponsorDailyChallengeRow {
  id: number;
  wallet: string;
  challenge_id: number;
  assigned_date: string;
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
  reward_amount: string;
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
  last_active_date: string | null;
  streak_multiplier: string;
  updated_at: Date;
}

// ── API Keys (migration 017) ──────────────────────────────────────────────────

export type ApiKeyTier = 'free' | 'standard' | 'premium';

export interface ApiKeyRow {
  id: number;
  name: string;
  prefix: string;
  key_hash: string;
  tier: ApiKeyTier;
  owner_wallet: string | null;
  is_active: boolean;
  created_at: Date;
  last_used_at: Date | null;
  revoked_at: Date | null;
}

/** Rolling hourly usage accounting for a single API key. */
export interface ApiKeyUsageRow {
  id: number;
  api_key_id: number;
  window_ms: number;
  count: number;
  queued: number;
  updated_at: Date;
}

// ── Joined view type (common API response shape) ──────────────────────────────

/** Convenience type: tree row joined with planter display name and species. */
export interface TreeWithDetails extends TreeRow {
  planter_name: string | null;
  planter_stellar: string | null;
  species_name: string | null;
  co2_kg_per_year: string | null;
}
