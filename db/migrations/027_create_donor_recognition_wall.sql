-- Migration: 027_create_donor_recognition_wall.sql
-- Issue #1656 — Donor recognition wall on the platform homepage.
--
-- Sponsors are identified by Stellar wallet address (same key as
-- sponsor_cohorts / sponsorship_events, migration 011). Trees funded per
-- sponsor are summed from sponsorship_events.trees_funded.

-- Per-sponsor recognition settings. Opt-in is OFF unless the sponsor turns it on.
CREATE TABLE IF NOT EXISTS sponsor_recognition_settings (
  wallet              TEXT PRIMARY KEY,
  recognition_opt_in  BOOLEAN NOT NULL DEFAULT FALSE,
  display_name        TEXT,
  logo_url            TEXT,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sponsor_recognition_opt_in
  ON sponsor_recognition_settings (wallet)
  WHERE recognition_opt_in;

-- Single-row weekly snapshot of the wall (id is pinned to 1). The API refreshes
-- it when it is older than 7 days, so the wall's rankings update weekly.
CREATE TABLE IF NOT EXISTS donor_wall_snapshot (
  id            SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  generated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  entries       JSONB NOT NULL DEFAULT '[]'
);
