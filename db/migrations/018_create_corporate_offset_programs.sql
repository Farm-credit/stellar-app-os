-- Migration 018: Corporate offset program (Issue #1337)
-- Companies set annual carbon offset targets; purchases are automated until
-- the target is met, with monthly progress reporting.

BEGIN;

-- One enrollment per company.
CREATE TABLE IF NOT EXISTS corporate_offset_programs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name        VARCHAR(255) NOT NULL,
  company_email       VARCHAR(255) NOT NULL,
  wallet_address      VARCHAR(80) NOT NULL,
  -- Annual target in tonnes CO2e
  annual_target_tco2e NUMERIC(14, 2) NOT NULL CHECK (annual_target_tco2e > 0),
  -- Auto-purchase settings
  auto_purchase       BOOLEAN NOT NULL DEFAULT TRUE,
  monthly_budget_cap  NUMERIC(14, 2),
  preferred_projects  TEXT[] NOT NULL DEFAULT '{}',
  preferred_types     TEXT[] NOT NULL DEFAULT '{}',
  -- net-zero / SBTi style flags used in reports
  net_zero_pledge     BOOLEAN NOT NULL DEFAULT FALSE,
  target_year         INT,
  status              VARCHAR(12) NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active', 'paused', 'cancelled', 'completed')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (wallet_address)
);

CREATE INDEX IF NOT EXISTS idx_corporate_offset_programs_status
  ON corporate_offset_programs (status) WHERE status = 'active';

-- Purchases executed by (or attributed to) the program.
CREATE TABLE IF NOT EXISTS corporate_offset_purchases (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id      UUID NOT NULL REFERENCES corporate_offset_programs(id) ON DELETE CASCADE,
  purchase_date   TIMESTAMPTZ NOT NULL DEFAULT now(),
  project_id      VARCHAR(64) NOT NULL,
  quantity_tco2e  NUMERIC(14, 4) NOT NULL CHECK (quantity_tco2e > 0),
  unit_price      NUMERIC(14, 6) NOT NULL CHECK (unit_price >= 0),
  total_price     NUMERIC(14, 2) NOT NULL CHECK (total_price >= 0),
  currency        VARCHAR(8) NOT NULL DEFAULT 'USDC',
  tx_hash         VARCHAR(80),
  automated       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_corporate_offset_purchases_program
  ON corporate_offset_purchases (program_id, purchase_date DESC);
CREATE INDEX IF NOT EXISTS idx_corporate_offset_purchases_month
  ON corporate_offset_purchases (program_id, date_trunc('month', purchase_date));

-- Generated monthly ESG progress reports.
CREATE TABLE IF NOT EXISTS corporate_offset_reports (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id            UUID NOT NULL REFERENCES corporate_offset_programs(id) ON DELETE CASCADE,
  report_period         DATE NOT NULL, -- first day of the reported month
  tonnes_purchased      NUMERIC(14, 4) NOT NULL DEFAULT 0,
  tonnes_cumulative     NUMERIC(14, 4) NOT NULL DEFAULT 0,
  target_remaining      NUMERIC(14, 4) NOT NULL DEFAULT 0,
  pct_of_target         NUMERIC(6, 2) NOT NULL DEFAULT 0,
  amount_spent          NUMERIC(14, 2) NOT NULL DEFAULT 0,
  projects_supported    JSONB NOT NULL DEFAULT '[]'::jsonb,
  co_benefits           JSONB NOT NULL DEFAULT '[]'::jsonb,
  documentation_url     TEXT,
  generated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (program_id, report_period)
);

CREATE INDEX IF NOT EXISTS idx_corporate_offset_reports_program
  ON corporate_offset_reports (program_id, report_period DESC);

COMMIT;
