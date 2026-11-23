-- Migration: 032_admin_projects.sql
--
-- Persistent store for admin-managed carbon projects so project approvals,
-- lifecycle status changes, and pricing updates survive restarts and emit
-- offset-verification webhooks (`project.approved`, `project.status.changed`,
-- `price.changed`) after commit.

BEGIN;

CREATE TABLE IF NOT EXISTS admin_projects (
  id                     TEXT           PRIMARY KEY,
  slug                   TEXT           NOT NULL UNIQUE,
  name                   TEXT           NOT NULL,
  description            TEXT           NOT NULL DEFAULT '',
  project_type           TEXT           NOT NULL,
  region                 TEXT           NOT NULL,
  country                TEXT           NOT NULL DEFAULT '',
  standard               TEXT           NOT NULL,
  methodology            TEXT           NOT NULL DEFAULT '',
  registry_project_id    TEXT           NOT NULL DEFAULT '',
  expected_annual_tonnes NUMERIC(16, 3) NOT NULL CHECK (expected_annual_tonnes > 0),
  price_per_ton_usd      NUMERIC(12, 2) NOT NULL CHECK (price_per_ton_usd > 0),
  available_supply_tons  NUMERIC(16, 3) NOT NULL DEFAULT 0,
  total_issued_tons      NUMERIC(16, 3) NOT NULL DEFAULT 0,
  lifecycle_status       TEXT           NOT NULL
                         CHECK (lifecycle_status IN ('Draft', 'Under Review', 'Approved', 'Paused', 'Archived')),
  verification_enabled   BOOLEAN        NOT NULL DEFAULT FALSE,
  verification_notes     TEXT           NOT NULL DEFAULT '',
  updated_by             TEXT           NOT NULL DEFAULT 'system',
  updated_at             TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  created_at             TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_projects_status
  ON admin_projects (lifecycle_status);

INSERT INTO admin_projects (
  id, slug, name, description, project_type, region, country, standard,
  methodology, registry_project_id, expected_annual_tonnes, price_per_ton_usd,
  available_supply_tons, total_issued_tons, lifecycle_status, verification_enabled,
  verification_notes, updated_by, updated_at
)
VALUES
  (
    'proj-001',
    'amazon-rainforest-reforestation',
    'Amazon Rainforest Reforestation',
    'Large-scale reforestation and biodiversity restoration program across degraded land parcels in the Brazilian Amazon.',
    'Reforestation',
    'Para',
    'Brazil',
    'Verra',
    'ARR-VM0047',
    'VCS-2048',
    950.000,
    48.50,
    1125.400,
    2875.750,
    'Approved',
    TRUE,
    'Most recent MRV package reviewed by internal verifier on Jan 18, 2026.',
    'A. Johnson',
    '2026-02-08T16:35:00.000Z'
  ),
  (
    'proj-002',
    'texas-wind-energy-farm',
    'Wind Energy Farm - Texas',
    'Grid-scale wind generation project in West Texas focused on replacing fossil-based generation during peak periods.',
    'Renewable Energy',
    'Texas',
    'United States',
    'Gold Standard',
    'ACM0002',
    'GS-11829',
    1325.000,
    37.90,
    980.600,
    1540.200,
    'Under Review',
    FALSE,
    'Pending updated turbine output audit before re-enabling verification.',
    'C. Lee',
    '2026-02-03T12:20:00.000Z'
  )
ON CONFLICT (id) DO NOTHING;

COMMIT;
