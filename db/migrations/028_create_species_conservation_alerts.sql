-- Migration: 028_create_species_conservation_alerts.sql
-- Issue #1657 — Endangered species status alerts for sponsored trees.
--
-- Two tables:
--
--   species_iucn_status        Cached IUCN Red List assessment per species in
--                              species_catalogue (one row per species_slug).
--                              Refreshed by the quarterly check
--                              (lib/species/conservation-checker.ts).
--
--   species_conservation_alerts One row per sponsor alert, deduped per
--                              (species_slug, sponsor_wallet, status, quarter)
--                              so a quarterly re-run never double-notifies.

-- Latest known IUCN Red List category for a catalogue species.
CREATE TABLE IF NOT EXISTS species_iucn_status (
  species_slug        TEXT PRIMARY KEY
                      REFERENCES species_catalogue (slug) ON DELETE CASCADE,

  -- IUCN taxon identifier from the assessment record.
  iucn_taxon_id       BIGINT,

  -- IUCN category code: EX, EW, CR, EN, VU, NT, LC, DD, NE.
  status_code         TEXT NOT NULL CHECK (status_code IN (
                        'EX', 'EW', 'CR', 'EN', 'VU', 'NT', 'LC', 'DD', 'NE'
                      )),

  -- Human-readable category, e.g. "Critically Endangered".
  status_label        TEXT NOT NULL,

  -- Population trend reported by IUCN: Increasing | Stable | Decreasing | Unknown.
  population_trend    TEXT CHECK (population_trend IN (
                        'Increasing', 'Stable', 'Decreasing', 'Unknown'
                      )),

  -- Whether this category counts as threatened under the IUCN definition
  -- (VU, EN, CR). Persisted so reporting queries need no lookup table.
  is_threatened       BOOLEAN NOT NULL DEFAULT FALSE,

  -- ISO 8601 timestamp of the IUCN assessment.
  assessed_at         TIMESTAMPTZ,

  -- Raw assessment payload (sanitised subset of the IUCN response) for audit.
  source              JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Quarterly-check bookkeeping.
  first_seen_status   TEXT,
  last_checked_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_check_quarter  VARCHAR(7),
  consecutive_errors  INTEGER NOT NULL DEFAULT 0,
  last_error          TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Sponsors are looked up by species on every quarterly run.
CREATE INDEX IF NOT EXISTS idx_species_iucn_status_threatened
  ON species_iucn_status (is_threatened);
CREATE INDEX IF NOT EXISTS idx_species_iucn_status_quarter
  ON species_iucn_status (last_check_quarter);

-- One row per (species, sponsor, category, quarter) — the idempotency key that
-- stops a retry of the same quarterly job from emailing a sponsor twice.
CREATE TABLE IF NOT EXISTS species_conservation_alerts (
  id                BIGSERIAL PRIMARY KEY,

  species_slug      TEXT NOT NULL REFERENCES species_catalogue (slug) ON DELETE CASCADE,
  common_name       TEXT NOT NULL,
  scientific_name   TEXT NOT NULL,

  -- Stellar wallet of the sponsor with trees of this species.
  sponsor_wallet    TEXT NOT NULL,

  -- How the status changed relative to the previous cached assessment.
  --   newly_listed — was not threatened before, is now
  --   upgraded     — already threatened, moved to a more severe category
  change_kind       TEXT NOT NULL CHECK (change_kind IN ('newly_listed', 'upgraded')),

  previous_status_code TEXT CHECK (previous_status_code IN (
                        'EX', 'EW', 'CR', 'EN', 'VU', 'NT', 'LC', 'DD', 'NE'
                      )),
  new_status_code      TEXT NOT NULL CHECK (new_status_code IN (
                        'EX', 'EW', 'CR', 'EN', 'VU', 'NT', 'LC', 'DD', 'NE'
                      )),
  population_trend     TEXT,

  -- Number of sponsored trees the sponsor holds for this species.
  tree_count        INTEGER NOT NULL DEFAULT 1 CHECK (tree_count >= 1),

  -- Quarterly window this alert belongs to, e.g. "2026-Q4".
  check_quarter     VARCHAR(7) NOT NULL,

  -- Delivery bookkeeping — in-app alerts are read from this table by
  -- /api/species/conservation-alerts; email is sent once by the checker.
  status            TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'delivered', 'failed')),
  email_sent_at     TIMESTAMPTZ,
  delivered_at      TIMESTAMPTZ,
  error_count       INTEGER NOT NULL DEFAULT 0,
  last_error        TEXT,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_species_conservation_alert UNIQUE
    (species_slug, sponsor_wallet, new_status_code, check_quarter)
);

-- The in-app feed reads alerts newest-first for one sponsor wallet.
CREATE INDEX IF NOT EXISTS idx_species_conservation_alerts_wallet
  ON species_conservation_alerts (sponsor_wallet, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_species_conservation_alerts_species
  ON species_conservation_alerts (species_slug);
CREATE INDEX IF NOT EXISTS idx_species_conservation_alerts_status
  ON species_conservation_alerts (status);

COMMENT ON TABLE species_iucn_status IS
  'Cached IUCN Red List assessment per catalogue species (Issue #1657).';
COMMENT ON TABLE species_conservation_alerts IS
  'Sponsor alerts for newly listed / upgraded threatened species, deduped per quarter.';
