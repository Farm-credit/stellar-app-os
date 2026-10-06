-- Migration: 016_add_sponsor_data_region.sql
-- Data residency (#1141): records the geographic region where sponsor data
-- must be stored so writes can be routed to the regional database
-- (EU → eu, APAC → apac, Americas → americas).

ALTER TABLE planting_waitlist
  ADD COLUMN IF NOT EXISTS data_region TEXT NOT NULL DEFAULT 'americas'
  CHECK (data_region IN ('eu', 'apac', 'americas'));

CREATE INDEX IF NOT EXISTS idx_waitlist_data_region
  ON planting_waitlist (data_region);

COMMENT ON COLUMN planting_waitlist.data_region IS
  'Data residency region for the sponsor record (eu, apac, americas).';
