/**
 * Types for the admin override audit log subsystem.
 *
 * Covers DB row shapes, service contracts, and API payloads.
 * Rows are INSERT-only; no update or delete paths exist.
 */

// ── DB row types (match migration 009) ───────────────────────────────────────

export type AuditEntityType =
  | 'tree'
  | 'planter'
  | 'dispute'
  | 'transaction'
  | 'credit'
  | 'user'
  | 'payout'
  | 'sanction_cache'
  | 'webhook_subscription'
  | 'species';

export type AuditActionType =
  | 'status_override'
  | 'payment_release'
  | 'payment_hold'
  | 'kyc_override'
  | 'dispute_resolve'
  | 'blacklist_add'
  | 'blacklist_remove'
  | 'sanction_clear'
  | 'data_correction'
  | 'account_suspend'
  | 'account_reinstate'
  | 'credit_adjustment'
  | 'config_change';

/** Shape of a row returned from admin_override_audit. */
export interface AdminOverrideAuditRow {
  id: number;
  event_id: string;
  admin_id: string;
  admin_display: string | null;
  entity_type: AuditEntityType;
  entity_id: string;
  action: AuditActionType;
  reason: string;
  before_state: Record<string, unknown> | null;
  after_state: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
  created_at: Date;
}

// ── Service layer ─────────────────────────────────────────────────────────────

/** Parameters for writing a new audit log row. */
export interface WriteAuditParams {
  admin_id: string;
  admin_display?: string | null;
  entity_type: AuditEntityType;
  entity_id: string;
  action: AuditActionType;
  reason: string;
  before_state?: Record<string, unknown> | null;
  after_state?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
}

// ── API payload types ─────────────────────────────────────────────────────────

/** POST /api/admin/audit — request body. */
export interface WriteAuditRequest {
  entity_type: AuditEntityType;
  entity_id: string;
  action: AuditActionType;
  reason: string;
  before_state?: Record<string, unknown> | null;
  after_state?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
}

/** POST /api/admin/audit — response body. */
export interface WriteAuditResponse {
  event_id: string;
  created_at: string;
}

/** GET /api/admin/audit — query parameters. */
export interface AuditQueryParams {
  admin_id?: string;
  entity_type?: AuditEntityType;
  entity_id?: string;
  action?: AuditActionType;
  limit?: number;
  offset?: number;
}

/** GET /api/admin/audit — response body. */
export interface AuditListResponse {
  data: AdminOverrideAuditRow[];
  total: number;
  limit: number;
  offset: number;
}
