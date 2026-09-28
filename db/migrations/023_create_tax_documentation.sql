-- Migration: 023_create_tax_documentation.sql
--
-- v2 tax documentation for farmers / planters.
--
-- Migration 009 (planter_payouts) already materialises escrow and direct
-- payouts as a taxable income source and serves the per-year CSV export.  This
-- migration adds the two pieces v2 needs:
--
--   1. carbon_credit_sales — line-item record of every carbon credit sale so
--      the sale itself can be reported, not just the payout it produced.
--   2. tax_documents — the generated documents (Form 1099-NEC, income summary,
--      carbon credit sale schedule) persisted per planter / tax year, so a
--      filing can be reproduced and audited later.
--
-- Both tables are additive; nothing in migration 009–022 is modified, so the
-- migration can be applied to a live database without downtime.
-- The API degrades gracefully if this migration has not been applied yet
-- (see lib/db/tax-documents.ts).

-- UP ─────────────────────────────────────────────────────────────────────────

-- ── 1. Carbon credit sale records ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS carbon_credit_sales (
  -- Surrogate key
  id                    BIGSERIAL      PRIMARY KEY,

  -- FK to the planter who sold the credits
  planter_id            BIGINT         NOT NULL REFERENCES planters (id) ON DELETE CASCADE,

  -- On-chain tx hash of the sale, or the internal settlement/invoice reference
  sale_ref              TEXT           NOT NULL,

  -- ISO-8601 date the sale settled (drives the tax year)
  sold_at               TIMESTAMPTZ    NOT NULL,

  -- Calendar year extracted from sold_at (indexed for per-year exports)
  tax_year              SMALLINT       NOT NULL GENERATED ALWAYS AS (
                                         EXTRACT(YEAR FROM sold_at)::SMALLINT
                                       ) STORED,

  -- Volume of credits sold, in tonnes CO2e
  credits_tons          NUMERIC(20, 4) NOT NULL CHECK (credits_tons > 0),

  -- Agreed price per tonne, in `currency`
  price_per_ton         NUMERIC(20, 4) NOT NULL CHECK (price_per_ton >= 0),

  -- Gross proceeds of the sale (positive)
  gross_amount          NUMERIC(30, 7) NOT NULL CHECK (gross_amount >= 0),

  -- Reporting currency and the Stellar asset it settled in
  currency              TEXT           NOT NULL DEFAULT 'USD',
  asset_code            TEXT           NOT NULL DEFAULT 'USDC',

  -- Optional references useful when reconciling against a filing
  buyer_ref             TEXT,
  project_ref           TEXT,
  verification_standard TEXT,
  memo                  TEXT,

  created_at            TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ    NOT NULL DEFAULT NOW(),

  -- A settlement reference must not be recorded twice
  CONSTRAINT uq_carbon_credit_sales_ref UNIQUE (sale_ref)
);

-- Export query is WHERE planter_id = $1 AND tax_year = $2
CREATE INDEX IF NOT EXISTS idx_ccs_planter_year
  ON carbon_credit_sales (planter_id, tax_year, sold_at DESC);

CREATE INDEX IF NOT EXISTS idx_ccs_tax_year
  ON carbon_credit_sales (tax_year);

-- ── 2. Generated tax documents ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tax_documents (
  id            BIGSERIAL      PRIMARY KEY,

  -- FK to the planter the document belongs to
  planter_id    BIGINT         NOT NULL REFERENCES planters (id) ON DELETE CASCADE,

  -- Calendar year the document covers
  tax_year      SMALLINT       NOT NULL,

  -- Which document this row holds payload for
  form_type     TEXT           NOT NULL
    CHECK (form_type IN ('1099-NEC', 'income-summary', 'carbon-credit-sales')),

  -- Filing lifecycle of the generated document
  status        TEXT           NOT NULL DEFAULT 'generated'
    CHECK (status IN ('draft', 'generated', 'filed')),

  -- USD total reported (Box 1 for a 1099-NEC, gross for a summary/schedule)
  gross_amount  NUMERIC(30, 2) NOT NULL DEFAULT 0,

  -- Number of income line items behind the totals
  record_count  INTEGER        NOT NULL DEFAULT 0,

  -- Full generated document (boxes, monthly buckets, line items, notes)
  payload       JSONB          NOT NULL,

  -- Stellar address / admin identifier that generated the document
  generated_by  TEXT,

  generated_at  TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ    NOT NULL DEFAULT NOW(),

  -- One document per planter, year and form type: regeneration is an upsert
  CONSTRAINT uq_tax_documents_planter_year_form
    UNIQUE (planter_id, tax_year, form_type)
);

CREATE INDEX IF NOT EXISTS idx_tax_documents_planter_year
  ON tax_documents (planter_id, tax_year);

-- ── 3. Consolidated taxable income view ─────────────────────────────────────
-- Both income sources in one relation, so an income summary (or a future
-- warehouse export) can be produced without application-side merging.

CREATE OR REPLACE VIEW v_planter_taxable_income AS
  SELECT
    pp.planter_id,
    pp.tax_year,
    'payout'::TEXT                    AS income_source,
    pp.tx_hash                        AS reference,
    pp.paid_at                        AS occurred_at,
    COALESCE(pp.asset_code, 'XLM')    AS asset_code,
    COALESCE(pp.asset_code, 'XLM')    AS currency,
    pp.amount                         AS gross_amount,
    NULL::NUMERIC(20, 4)              AS credits_tons,
    NULL::NUMERIC(20, 4)              AS price_per_ton,
    pp.payout_type                    AS category,
    pp.memo
  FROM planter_payouts pp
  UNION ALL
  SELECT
    ccs.planter_id,
    ccs.tax_year,
    'carbon_credit_sale'::TEXT        AS income_source,
    ccs.sale_ref                      AS reference,
    ccs.sold_at                       AS occurred_at,
    ccs.asset_code,
    ccs.currency,
    ccs.gross_amount,
    ccs.credits_tons,
    ccs.price_per_ton,
    ccs.verification_standard         AS category,
    ccs.memo
  FROM carbon_credit_sales ccs;

-- DOWN ────────────────────────────────────────────────────────────────────────
-- DROP VIEW  IF EXISTS v_planter_taxable_income;
-- DROP TABLE IF EXISTS tax_documents;
-- DROP TABLE IF EXISTS carbon_credit_sales;
