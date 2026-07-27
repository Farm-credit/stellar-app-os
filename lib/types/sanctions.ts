/**
 * Types for the sanction list lookup subsystem.
 *
 * Covers DB row shapes, service contracts, and API payloads.
 */

// ── DB row types (match migration 008) ───────────────────────────────────────

export type SanctionCheckResult =
  | 'clear'
  | 'flagged'
  | 'error'
  | 'cached_clear'
  | 'cached_flagged';

export interface SanctionCacheRow {
  id: number;
  stellar_address: string;
  result: SanctionCheckResult;
  provider: string;
  raw_response: Record<string, unknown> | null;
  checked_at: Date;
  cache_expires_at: Date;
  created_at: Date;
  updated_at: Date;
}

export interface SanctionAuditLogRow {
  id: number;
  stellar_address: string;
  result: SanctionCheckResult;
  provider: string;
  cache_hit: boolean;
  requested_by: string | null;
  request_context: string | null;
  created_at: Date;
}

// ── Service layer ─────────────────────────────────────────────────────────────

/** Result returned by the sanction lookup service. */
export interface SanctionLookupResult {
  stellar_address: string;
  result: SanctionCheckResult;
  /** Provider that produced the result (or 'cache' if served from cache). */
  provider: string;
  /** Whether the result came from the local cache. */
  cache_hit: boolean;
  /** ISO timestamp of when the underlying check was performed. */
  checked_at: string;
  /** ISO timestamp when this cache entry expires (null if from live check). */
  cache_expires_at: string;
}

/** Parameters for recording a lookup in the audit log. */
export interface RecordAuditParams {
  stellar_address: string;
  result: SanctionCheckResult;
  provider: string;
  cache_hit: boolean;
  requested_by?: string | null;
  request_context?: string | null;
}

// ── API payload types ─────────────────────────────────────────────────────────

/** POST /api/sanctions/lookup — request body. */
export interface SanctionLookupRequest {
  /** Stellar public key (G… address) to check. */
  stellar_address: string;
  /** Optional free-text context (e.g. 'planter_registration'). */
  context?: string;
}

/** POST /api/sanctions/lookup — success response body. */
export interface SanctionLookupResponse {
  stellar_address: string;
  result: SanctionCheckResult;
  provider: string;
  cache_hit: boolean;
  checked_at: string;
  cache_expires_at: string;
}

/** GET /api/sanctions/audit — query parameters. */
export interface SanctionAuditQuery {
  address?: string;
  result?: SanctionCheckResult;
  limit?: number;
  offset?: number;
}

/** GET /api/sanctions/audit — response body. */
export interface SanctionAuditResponse {
  data: SanctionAuditLogRow[];
  total: number;
  limit: number;
  offset: number;
}
