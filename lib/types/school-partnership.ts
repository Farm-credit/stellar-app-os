/**
 * School partnership program types.
 * Issue #1149 — Group sponsorship programs for students.
 */

// ── Constants ───────────────────────────────────────────────────────────────

export const SCHOOL_TIER_DISCOUNTS: Record<SchoolTier, number> = {
  standard: 0,
  bronze: 5,
  silver: 10,
  gold: 15,
} as const;

export type SchoolTier = 'standard' | 'bronze' | 'silver' | 'gold';

export type BatchStatus = 'open' | 'funded' | 'completed' | 'cancelled';

// ── Database row types ──────────────────────────────────────────────────────

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
  discount_pct: string; // NUMERIC
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
  total_xlm: string; // NUMERIC
  discount_pct: string; // NUMERIC
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
  xlm_amount: string; // NUMERIC
  tx_hash: string | null;
  contributed_at: Date;
}

// ── API types ───────────────────────────────────────────────────────────────

export interface SchoolPartnershipSummary {
  id: number;
  school_name: string;
  tier: SchoolTier;
  discount_pct: number;
  student_count: number;
  active_batches: number;
  total_trees_funded: number;
  country_code: string;
  created_at: string;
}

export interface SchoolPartnershipDetail extends SchoolPartnershipSummary {
  contact_name: string;
  contact_email: string;
  city: string | null;
  members: SchoolMemberSummary[];
  batches: SchoolBatchSummary[];
}

export interface SchoolMemberSummary {
  id: number;
  wallet: string;
  student_name: string | null;
  grade: string | null;
  enrolled_at: string;
}

export interface SchoolBatchSummary {
  id: number;
  project_name: string;
  description: string | null;
  target_trees: number;
  trees_funded: number;
  progress_pct: number;
  total_xlm: number;
  discount_pct: number;
  status: BatchStatus;
  created_at: string;
  completed_at: string | null;
}

export interface CreateSchoolPartnershipInput {
  school_name: string;
  contact_name: string;
  contact_email: string;
  contact_wallet?: string;
  country_code?: string;
  city?: string;
  student_count?: number;
  tier?: SchoolTier;
}

export interface CreateBatchInput {
  partnership_id: number;
  project_name: string;
  description?: string;
  target_trees?: number;
  created_by: string;
}

export interface ContributeToBatchInput {
  batch_id: number;
  wallet: string;
  member_id?: number;
  trees_funded: number;
  xlm_amount: number;
  tx_hash?: string;
}

/** Bulk enrollment of students into a school partnership. */
export interface EnrollStudentsInput {
  partnership_id: number;
  students: Array<{
    wallet: string;
    student_name?: string;
    grade?: string;
  }>;
}
