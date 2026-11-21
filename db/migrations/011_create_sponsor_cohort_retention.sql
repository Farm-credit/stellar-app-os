-- Migration: 011_create_sponsor_cohort_retention.sql
-- Issue #993 — Track sponsor signup dates and repeat sponsorships for monthly retention cohort analysis.

-- Stores each sponsor's first-ever sponsorship date (their "cohort month").
-- A sponsor is identified by their Stellar wallet address.
CREATE TABLE IF NOT EXISTS sponsor_cohorts (
  wallet          TEXT PRIMARY KEY,
  first_sponsorship_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cohort_month    DATE NOT NULL,  -- month bucket derived from first_sponsorship_at (first day of month)
  total_sponsorships INT NOT NULL DEFAULT 0,
  total_trees     INT NOT NULL DEFAULT 0,
  total_xlm       NUMERIC(14, 6) NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sponsor_cohorts_cohort_month
  ON sponsor_cohorts (cohort_month);

-- Stores every individual sponsorship event for a sponsor.
-- This is the granular data source for cohort retention calculations.
CREATE TABLE IF NOT EXISTS sponsorship_events (
  id              BIGSERIAL PRIMARY KEY,
  wallet          TEXT NOT NULL,
  tree_id         BIGINT REFERENCES trees (id) ON DELETE SET NULL,
  trees_funded    INT NOT NULL DEFAULT 1,
  xlm_amount      NUMERIC(14, 6) NOT NULL DEFAULT 0,
  tx_hash         TEXT,
  funded_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cohort_month    DATE NOT NULL,  -- duplicated from sponsor_cohorts for fast cohort joins
  metadata        JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_sponsorship_events_wallet
  ON sponsorship_events (wallet);
CREATE INDEX IF NOT EXISTS idx_sponsorship_events_funded_at
  ON sponsorship_events (funded_at);
CREATE INDEX IF NOT EXISTS idx_sponsorship_events_cohort_month
  ON sponsorship_events (cohort_month);
CREATE INDEX IF NOT EXISTS idx_sponsorship_events_wallet_funded
  ON sponsorship_events (wallet, funded_at);

-- Monthly retention cohort snapshot table.
-- Populated by a monthly cron job or on-demand analytics query.
-- Each row = one cohort month × one subsequent month offset (0 = signup month, 1 = month after, etc.)
CREATE TABLE IF NOT EXISTS sponsor_cohort_retention (
  id              BIGSERIAL PRIMARY KEY,
  cohort_month    DATE NOT NULL,  -- first day of the cohort month
  period_month    DATE NOT NULL,  -- first day of the measured month
  period_offset   INT NOT NULL,   -- months since cohort (0 = signup month)
  cohort_size     INT NOT NULL,   -- number of sponsors who signed up in this cohort month
  retained_count  INT NOT NULL,   -- how many of those sponsors were active in period_month
  retention_pct   NUMERIC(5, 2) NOT NULL, -- retained_count / cohort_size * 100
  total_xlm       NUMERIC(14, 6) NOT NULL DEFAULT 0,
  generated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (cohort_month, period_month)
);

CREATE INDEX IF NOT EXISTS idx_cohort_retention_cohort
  ON sponsor_cohort_retention (cohort_month);
CREATE INDEX IF NOT EXISTS idx_cohort_retention_period
  ON sponsor_cohort_retention (period_month);

COMMENT ON TABLE sponsor_cohorts IS 'Tracks each sponsor wallet with their first sponsorship date and cohort month.';
COMMENT ON TABLE sponsorship_events IS 'Granular record of every sponsorship transaction for cohort analysis.';
COMMENT ON TABLE sponsor_cohort_retention IS 'Pre-computed monthly cohort retention snapshots.';
