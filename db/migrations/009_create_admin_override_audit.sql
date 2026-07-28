-- Migration: 009_create_admin_override_audit.sql
--
-- Immutable audit log table for all administrative override actions.
-- Rows are INSERT-only — no UPDATE or DELETE paths exist in the application.
-- The table uses append-only semantics to satisfy compliance requirements.

-- UP ─────────────────────────────────────────────────────────────────────────

-- The entity type that was affected by the override
CREATE TYPE audit_entity_type AS ENUM (
  'tree',
  'planter',
  'dispute',
  'transaction',
  'credit',
  'user',
  'payout',
  'sanction_cache',
  'webhook_subscription',
  'species'
);

-- The class of override action performed
CREATE TYPE audit_action_type AS ENUM (
  'status_override',          -- e.g. force-approve a tree verification
  'payment_release',          -- manually release escrowed funds
  'payment_hold',             -- hold/freeze a pending payout
  'kyc_override',             -- mark KYC passed/failed manually
  'dispute_resolve',          -- admin resolves a dispute
  'blacklist_add',            -- add planter/address to blacklist
  'blacklist_remove',         -- remove planter/address from blacklist
  'sanction_clear',           -- manually clear a sanction flag
  'data_correction',          -- correct a data entry error
  'account_suspend',          -- suspend user account
  'account_reinstate',        -- reinstate suspended account
  'credit_adjustment',        -- manual credit balance adjustment
  'config_change'             -- platform configuration changed
);

-- Immutable admin override audit log.
-- This table must NEVER have UPDATE or DELETE statements executed against it.
-- Row-level security should enforce this in production PostgreSQL.
CREATE TABLE IF NOT EXISTS admin_override_audit (
  -- Surrogate primary key
  id                BIGSERIAL          PRIMARY KEY,

  -- Stable public identifier for this audit event (safe to expose in APIs)
  event_id          UUID               NOT NULL DEFAULT gen_random_uuid(),

  -- Who performed the action (admin user id or system identifier)
  admin_id          TEXT               NOT NULL,

  -- Human-readable admin display name (denormalised for immutability)
  admin_display     TEXT,

  -- What kind of entity was modified
  entity_type       audit_entity_type  NOT NULL,

  -- ID of the affected entity (flexible TEXT to support UUIDs and integers)
  entity_id         TEXT               NOT NULL,

  -- What action was performed
  action            audit_action_type  NOT NULL,

  -- Free-text justification supplied by the admin (required in the UI)
  reason            TEXT               NOT NULL,

  -- Snapshot of the entity's state BEFORE the override (for rollback/audit)
  before_state      JSONB,

  -- Snapshot of the entity's state AFTER the override
  after_state       JSONB,

  -- Additional contextual metadata (IP address, session id, etc.)
  metadata          JSONB              NOT NULL DEFAULT '{}',

  -- When the override was applied (server time, not client-supplied)
  created_at        TIMESTAMPTZ        NOT NULL DEFAULT NOW()

  -- Deliberately no updated_at or deleted_at — rows are immutable.
);

-- Indexes for common admin audit query patterns
CREATE INDEX IF NOT EXISTS idx_audit_admin_id
  ON admin_override_audit (admin_id);
CREATE INDEX IF NOT EXISTS idx_audit_entity
  ON admin_override_audit (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_action
  ON admin_override_audit (action);
CREATE INDEX IF NOT EXISTS idx_audit_created
  ON admin_override_audit (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_event_id
  ON admin_override_audit (event_id);

-- Optional: enforce immutability at DB level with a rule
-- (relies on PostgreSQL; comment out if using a managed DB that restricts DDL)
CREATE RULE admin_override_audit_no_update AS
  ON UPDATE TO admin_override_audit DO INSTEAD NOTHING;

CREATE RULE admin_override_audit_no_delete AS
  ON DELETE TO admin_override_audit DO INSTEAD NOTHING;

-- DOWN ────────────────────────────────────────────────────────────────────────
-- To rollback:
--   DROP TABLE admin_override_audit;
--   DROP TYPE audit_action_type;
--   DROP TYPE audit_entity_type;
