-- Migration: 034_create_planting_location_requests.sql
--
-- Stores sponsor planting location preference requests submitted at checkout.
-- Admins review pending requests, match them to available planting zones
-- (either confirming a matching zone or assigning an alternative), and
-- sponsors are notified of the decision.

CREATE TABLE IF NOT EXISTS planting_location_requests (
  id                   TEXT         PRIMARY KEY,
  sponsor_id           TEXT,
  sponsor_name         VARCHAR(200) NOT NULL DEFAULT '',
  sponsor_email        VARCHAR(320) NOT NULL,
  transaction_ref      VARCHAR(200),
  tree_count           INTEGER      NOT NULL DEFAULT 1 CHECK (tree_count > 0),
  preferred_region     VARCHAR(120) NOT NULL,
  preferred_country    VARCHAR(120),
  preference_notes     TEXT,
  status               VARCHAR(32)  NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending', 'confirmed', 'alternative_assigned')),
  assigned_location_id INTEGER      REFERENCES planting_locations(id) ON DELETE SET NULL,
  assigned_zone_name   VARCHAR(200),
  assigned_region      VARCHAR(120),
  admin_notes          TEXT,
  reviewed_by          VARCHAR(200),
  reviewed_at          TIMESTAMPTZ,
  notified_at          TIMESTAMPTZ,
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_plr_status
  ON planting_location_requests (status);

CREATE INDEX IF NOT EXISTS idx_plr_preferred_region
  ON planting_location_requests (preferred_region);

CREATE INDEX IF NOT EXISTS idx_plr_sponsor_email
  ON planting_location_requests (sponsor_email);

CREATE INDEX IF NOT EXISTS idx_plr_created_at
  ON planting_location_requests (created_at DESC);
