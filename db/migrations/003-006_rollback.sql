-- Rollback: 003-006_drop_trees_planters_progress_disputes.sql
-- Closes #546
--
-- Reverses migrations 003–006 in dependency order.
-- Run this to roll back the trees, planters, progress_updates, and disputes
-- tables together. Existing data WILL be lost.

-- Drop in reverse dependency order ───────────────────────────────────────────

DROP TABLE IF EXISTS disputes         CASCADE;
DROP TABLE IF EXISTS progress_updates CASCADE;
DROP TABLE IF EXISTS trees            CASCADE;
DROP TABLE IF EXISTS planters         CASCADE;

-- Drop custom enum types introduced in migration 006
DROP TYPE IF EXISTS dispute_status   CASCADE;
DROP TYPE IF EXISTS dispute_category CASCADE;
