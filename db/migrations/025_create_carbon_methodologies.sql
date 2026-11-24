-- Migration: 025_create_carbon_methodologies.sql
--
-- Carbon methodology library (v1).
--
-- A read-mostly reference catalogue of carbon calculation methodologies
-- (Verra VCS, CDM/UNFCCC, Gold Standard, IPCC guidelines, ...) grouped into the
-- five project categories the platform supports: reforestation, soil
-- sequestration, renewable energy, methane reduction and energy efficiency.
--
-- This table DESCRIBES methodologies (formula summary, parameters, applicability).
-- It does not execute calculations and is not referenced by credit issuance.
--
-- Populated by scripts/seed-carbon-methodologies.ts from
-- data/carbon-methodologies/*.json. See docs/carbon-methodologies.md.

CREATE TABLE IF NOT EXISTS carbon_methodologies (
  -- Stable lowercase identifier, e.g. 'vm0047', 'ams-iii-d'
  slug               TEXT        PRIMARY KEY,

  -- Registry code as published, e.g. 'VM0047', 'AMS-III.D'
  code               TEXT        NOT NULL,

  -- Registry title of the methodology
  name               TEXT        NOT NULL,

  category           TEXT        NOT NULL
    CHECK (category IN (
      'reforestation',
      'soil_sequestration',
      'renewable_energy',
      'methane_reduction',
      'energy_efficiency'
    )),

  -- Issuing programme, e.g. 'Verra VCS', 'CDM', 'IPCC'
  standard           TEXT        NOT NULL,

  -- Registry version this entry was checked against. NULL = not pinned in v1.
  version            TEXT,

  description        TEXT        NOT NULL,

  -- Human-readable summary of the core emission-reduction / removal equation
  formula            TEXT        NOT NULL,

  -- [{ "symbol": "EG_PJ,y", "name": "...", "unit": "MWh/yr", "description": "..." }, ...]
  parameters         JSONB       NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(parameters) = 'array'),

  -- Conditions under which the methodology may be applied
  applicability      TEXT[]      NOT NULL DEFAULT '{}',

  -- Citation of the source document(s) the summary was written from
  source_ref         TEXT        NOT NULL,

  -- TRUE when code, title (and version, if set) were confirmed against the registry
  metadata_verified  BOOLEAN     NOT NULL DEFAULT FALSE,

  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_carbon_methodologies_category ON carbon_methodologies (category);
CREATE INDEX IF NOT EXISTS idx_carbon_methodologies_standard ON carbon_methodologies (standard);
