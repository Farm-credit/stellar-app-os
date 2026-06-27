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
  lat: string | null;    // NUMERIC returned as string by pg driver
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
  lat: string;           // NUMERIC
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
  | 'status_change'
  | 'photo_submitted'
  | 'gps_ping'
  | 'survival_check'
  | 'note';

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

export type DisputeStatus =
  | 'open'
  | 'under_review'
  | 'resolved'
  | 'escalated'
  | 'closed';

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

// ── Joined view type (common API response shape) ──────────────────────────────

/** Convenience type: tree row joined with planter display name and species. */
export interface TreeWithDetails extends TreeRow {
  planter_name: string | null;
  planter_stellar: string | null;
  species_name: string | null;
  co2_kg_per_year: string | null;
}
