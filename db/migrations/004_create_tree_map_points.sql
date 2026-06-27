-- Migration: 004_create_tree_map_points.sql
-- Stores hashed regional coordinates for the live tree-planting map.
-- Exact GPS is never stored here; only the geohash cell (precision-5 ≈ 5km²).

CREATE TABLE IF NOT EXISTS tree_map_points (
  geohash       TEXT        PRIMARY KEY,   -- precision-5 geohash cell
  region        TEXT        NOT NULL,      -- human-readable region label
  tree_count    INTEGER     NOT NULL DEFAULT 1,
  last_updated  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tmp_region ON tree_map_points (region);
