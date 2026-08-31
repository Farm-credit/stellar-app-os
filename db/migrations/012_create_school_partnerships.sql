-- Migration: 012_create_school_partnerships.sql
-- Issue #1149 — School partnership programs enabling students to sponsor trees as class projects with group discounts.

-- A school or educational institution enrolled in the partnership program.
CREATE TABLE IF NOT EXISTS school_partnerships (
  id              BIGSERIAL PRIMARY KEY,
  school_name     TEXT NOT NULL CHECK (char_length(trim(school_name)) BETWEEN 2 AND 200),
  contact_name    TEXT NOT NULL,
  contact_email   TEXT NOT NULL,
  contact_wallet  TEXT,  -- optional Stellar wallet for the school admin
  country_code    TEXT NOT NULL DEFAULT 'NG',
  city            TEXT,
  student_count   INT NOT NULL DEFAULT 0,
  tier            TEXT NOT NULL DEFAULT 'standard' CHECK (tier IN ('standard', 'bronze', 'silver', 'gold')),
  discount_pct    NUMERIC(5, 2) NOT NULL DEFAULT 0 CHECK (discount_pct >= 0 AND discount_pct <= 50),
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_school_partnerships_active
  ON school_partnerships (active) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_school_partnerships_country
  ON school_partnerships (country_code);

-- Students enrolled in a school partnership program.
CREATE TABLE IF NOT EXISTS school_partnership_members (
  id              BIGSERIAL PRIMARY KEY,
  partnership_id  BIGINT NOT NULL REFERENCES school_partnerships (id) ON DELETE CASCADE,
  wallet          TEXT NOT NULL,
  student_name    TEXT,
  grade           TEXT,
  enrolled_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (partnership_id, wallet)
);

CREATE INDEX IF NOT EXISTS idx_school_members_wallet
  ON school_partnership_members (wallet);
CREATE INDEX IF NOT EXISTS idx_school_members_partnership
  ON school_partnership_members (partnership_id);

-- Class project sponsorship batches — a group of students sponsoring trees together.
CREATE TABLE IF NOT EXISTS school_sponsorship_batches (
  id              BIGSERIAL PRIMARY KEY,
  partnership_id  BIGINT NOT NULL REFERENCES school_partnerships (id) ON DELETE CASCADE,
  project_name    TEXT NOT NULL CHECK (char_length(trim(project_name)) BETWEEN 2 AND 200),
  description     TEXT,
  target_trees    INT NOT NULL DEFAULT 10 CHECK (target_trees > 0),
  trees_funded    INT NOT NULL DEFAULT 0,
  total_xlm       NUMERIC(14, 6) NOT NULL DEFAULT 0,
  discount_pct    NUMERIC(5, 2) NOT NULL DEFAULT 0,  -- snapshot of discount at time of batch creation
  status          TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'funded', 'completed', 'cancelled')),
  created_by      TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_school_batches_partnership
  ON school_sponsorship_batches (partnership_id);
CREATE INDEX IF NOT EXISTS idx_school_batches_status
  ON school_sponsorship_batches (status);

-- Individual student contributions within a batch.
CREATE TABLE IF NOT EXISTS school_batch_contributions (
  id              BIGSERIAL PRIMARY KEY,
  batch_id        BIGINT NOT NULL REFERENCES school_sponsorship_batches (id) ON DELETE CASCADE,
  member_id       BIGINT REFERENCES school_partnership_members (id) ON DELETE SET NULL,
  wallet          TEXT NOT NULL,
  trees_funded    INT NOT NULL DEFAULT 1,
  xlm_amount      NUMERIC(14, 6) NOT NULL DEFAULT 0,
  tx_hash         TEXT,
  contributed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_batch_contributions_batch
  ON school_batch_contributions (batch_id);
CREATE INDEX IF NOT EXISTS idx_batch_contributions_wallet
  ON school_batch_contributions (wallet);

COMMENT ON TABLE school_partnerships IS 'Educational institutions enrolled in the group sponsorship program.';
COMMENT ON TABLE school_partnership_members IS 'Students enrolled in a school partnership.';
COMMENT ON TABLE school_sponsorship_batches IS 'Class project sponsorship batches (group tree sponsorships).';
COMMENT ON TABLE school_batch_contributions IS 'Individual student contributions within a batch.';
