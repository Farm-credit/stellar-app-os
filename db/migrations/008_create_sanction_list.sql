-- Migration: 008_create_sanction_list.sql
--
-- Sanction list lookup cache and audit of wallet address checks.
-- Keeps a local TTL-based cache of OFAC/UN sanction list results so the
-- platform can verify planter and buyer Stellar wallet addresses without
-- hitting external APIs on every transaction.

-- UP ─────────────────────────────────────────────────────────────────────────

-- Possible outcomes of a sanction list check
CREATE TYPE sanction_check_result AS ENUM (
  'clear',       -- address not found on any sanction list
  'flagged',     -- address matches a sanction list entry
  'error',       -- external API call failed; result unknown
  'cached_clear', -- served from local cache, previously clear
  'cached_flagged' -- served from local cache, previously flagged
);

-- Cache table: one row per unique stellar_address.
-- Rows are refreshed when cache_expires_at < NOW().
CREATE TABLE IF NOT EXISTS sanction_cache (
  id                BIGSERIAL   PRIMARY KEY,
  stellar_address   TEXT        NOT NULL UNIQUE,
  result            sanction_check_result NOT NULL,
  provider          TEXT        NOT NULL,        -- e.g. 'chainalysis', 'elliptic', 'mock'
  raw_response      JSONB,                       -- full API response (redacted of secrets)
  checked_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cache_expires_at  TIMESTAMPTZ NOT NULL,        -- typically checked_at + 24h
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Audit log: every lookup attempt is recorded for compliance.
-- Immutable (no updates/deletes). Retains the result even after cache expiry.
CREATE TABLE IF NOT EXISTS sanction_audit_log (
  id              BIGSERIAL   PRIMARY KEY,
  stellar_address TEXT        NOT NULL,
  result          sanction_check_result NOT NULL,
  provider        TEXT        NOT NULL,
  cache_hit       BOOLEAN     NOT NULL DEFAULT FALSE,
  requested_by    TEXT,                          -- admin or system identifier
  request_context TEXT,                          -- e.g. 'planter_registration', 'transaction'
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_sanction_cache_address
  ON sanction_cache (stellar_address);
CREATE INDEX IF NOT EXISTS idx_sanction_cache_expires
  ON sanction_cache (cache_expires_at);

CREATE INDEX IF NOT EXISTS idx_sanction_audit_address
  ON sanction_audit_log (stellar_address);
CREATE INDEX IF NOT EXISTS idx_sanction_audit_created
  ON sanction_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sanction_audit_result
  ON sanction_audit_log (result);

-- DOWN ────────────────────────────────────────────────────────────────────────
-- To rollback: DROP TABLE sanction_audit_log; DROP TABLE sanction_cache;
--              DROP TYPE sanction_check_result;
