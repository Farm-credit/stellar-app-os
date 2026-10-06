-- Rollback for 016_add_sponsor_data_region.sql

ALTER TABLE planting_waitlist
  DROP COLUMN IF EXISTS data_region;
