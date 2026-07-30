-- Migration: 000_create_schema_migrations.sql
-- Tracks which database migrations have been applied.
-- This table is required for the automated migration runner.

CREATE TABLE IF NOT EXISTS schema_migrations (
  -- Migration filename (e.g., '001_create_indexed_transactions.sql')
  migration_name TEXT PRIMARY KEY,

  -- Timestamp when this migration was applied
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Checksum of the migration file content (for integrity verification)
  checksum TEXT NOT NULL,

  -- How long the migration took to run (in milliseconds)
  execution_time_ms INTEGER
);

-- Index for fast lookup of pending migrations
CREATE INDEX IF NOT EXISTS idx_sm_applied_at ON schema_migrations (applied_at DESC);
