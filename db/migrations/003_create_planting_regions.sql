-- Migration: 003_create_planting_regions.sql
--
-- Stores one row per planting photo upload.
-- The raw GPS coordinates are NEVER stored here — only the HMAC region key
-- (opaque to observers) and the grid cell center (safe to expose on the map).
--
-- Schema intentionally minimal: the map API aggregates counts from this table.

CREATE TABLE IF NOT EXISTS planting_regions (
  id           SERIAL       PRIMARY KEY,

  -- HMAC-SHA256(secret, "lat:<snapped>,lon:<snapped>") — opaque, non-reversible
  region_key   TEXT         NOT NULL,

  -- Center of the 0.5° grid cell — the only coordinates exposed to the frontend
  center_lat   NUMERIC(8, 4) NOT NULL,
  center_lon   NUMERIC(8, 4) NOT NULL,

  -- Farmer's Stellar public key (not exposed on map, used for deduplication)
  farmer_id    TEXT         NOT NULL,

  -- S3 object key of the uploaded photo (for internal audit only)
  s3_key       TEXT,

  uploaded_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pr_region_key  ON planting_regions (region_key);
CREATE INDEX IF NOT EXISTS idx_pr_uploaded_at ON planting_regions (uploaded_at DESC);
