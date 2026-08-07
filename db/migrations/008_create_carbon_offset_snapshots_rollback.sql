-- Rollback: 008_create_carbon_offset_snapshots.sql
-- Not run automatically by scripts/run-migrations.mjs — execute manually if needed.

DROP INDEX IF EXISTS idx_carbon_offset_snapshots_date;
DROP TABLE IF EXISTS carbon_offset_snapshots;
