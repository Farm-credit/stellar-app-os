/**
 * Sponsor cohort retention analytics types.
 * Issue #993 — Track sponsor signup dates and repeat sponsorships.
 */

// ── Database row types ──────────────────────────────────────────────────────

export interface SponsorCohortRow {
  wallet: string;
  first_sponsorship_at: Date;
  cohort_month: Date;
  total_sponsorships: number;
  total_trees: number;
  total_xlm: string; // NUMERIC returned as string by pg
  created_at: Date;
  updated_at: Date;
}

export interface SponsorshipEventRow {
  id: number;
  wallet: string;
  tree_id: number | null;
  trees_funded: number;
  xlm_amount: string; // NUMERIC
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
  retention_pct: string; // NUMERIC
  total_xlm: string; // NUMERIC
  generated_at: Date;
}

// ── API response types ──────────────────────────────────────────────────────

/** A single row in the cohort retention matrix. */
export interface CohortRow {
  cohort_month: string; // "2025-01" format
  cohort_size: number;
  periods: CohortPeriodData[];
}

export interface CohortPeriodData {
  period_offset: number; // 0 = signup month, 1 = month after, …
  period_month: string; // "2025-02" format
  retained_count: number;
  retention_pct: number;
  total_xlm: number;
}

/** Full cohort retention report. */
export interface CohortRetentionReport {
  generated_at: string;
  cohorts: CohortRow[];
  summary: CohortSummary;
}

export interface CohortSummary {
  total_cohorts: number;
  latest_cohort_month: string;
  average_m1_retention: number | null; // avg retention at month+1 across cohorts
  average_m3_retention: number | null; // avg retention at month+3
  total_sponsors_all_time: number;
  total_sponsorships_all_time: number;
}

/** Query parameters for the cohort retention API. */
export interface CohortQueryParams {
  /** Only include cohorts starting from this month (YYYY-MM). */
  from?: string;
  /** Only include cohorts up to this month (YYYY-MM). */
  to?: string;
  /** Maximum number of period offsets to include (default: 12). */
  max_periods?: number;
}

/** Input for recording a new sponsorship event. */
export interface RecordSponsorshipInput {
  wallet: string;
  tree_id?: number;
  trees_funded?: number;
  xlm_amount?: number;
  tx_hash?: string;
  metadata?: Record<string, unknown>;
}

/** Sponsor retention summary for a single wallet. */
export interface SponsorRetentionSummary {
  wallet: string;
  cohort_month: string;
  total_sponsorships: number;
  total_trees: number;
  total_xlm: number;
  months_active: number;
  last_sponsorship_at: string;
  is_currently_active: boolean; // sponsored in last 30 days
}
