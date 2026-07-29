-- Migration: 008_create_carbon_offset_snapshots.sql
-- Closes #839
--
-- Stores one row per UTC day computed by the daily carbon-offset cron job
-- (lib/carbon/worker.ts). Each row is the total estimated CO2 sequestered
-- to date across all "active" trees at the time the job ran.
--
-- ASSUMPTION 1 — "active plots" → active trees.
-- This schema has no `plots` table, only individual `trees` rows (status:
-- funded/planted/verified/completed/failed). An "active plot" is treated
-- as a tree with status IN ('planted', 'verified', 'completed') AND
-- deleted_at IS NULL — i.e. physically planted and not soft-deleted.
-- 'completed' is included because it is a distinct status from 'failed' in
-- this schema (a completed tree finished its monitoring lifecycle
-- successfully; it did not die) — excluding it would undercount live trees.
-- If a maintainer intends a narrower set, the WHERE clause in
-- lib/carbon/worker.ts (ACTIVE_STATUSES) is the single place to adjust.
--
-- ASSUMPTION 2 — cumulative-to-date, not an annual rate.
-- species_catalogue.co2_kg_per_year is a per-year FAO/IPCC Tier-1 estimate.
-- The issue asks for "total metric tons CO2 sequestered", which reads as a
-- stock (amount sequestered so far), not a flow (current annual rate) — so
-- this job prorates each tree's contribution by its age in years (capped
-- at the species' maturity_years, since the Tier-1 average-annual rate is
-- only designed to model growth up to maturity). A tree planted yesterday
-- therefore contributes ~0, not a full year's rate. This is distinct from
-- the flat 48kg/tree lifetime constant (CO2_KG_PER_TREE) used elsewhere in
-- the codebase for a different purpose (simplified per-sponsor display).

-- UP ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS carbon_offset_snapshots (
  id                        BIGSERIAL       PRIMARY KEY,

  -- The UTC calendar date this snapshot represents. One row per day —
  -- re-running the job for the same day upserts rather than duplicates.
  snapshot_date             DATE            NOT NULL UNIQUE,

  -- Active trees included in this snapshot (status filter above)
  active_tree_count         INTEGER         NOT NULL CHECK (active_tree_count >= 0),

  -- Active trees with no species / no matching species_catalogue row —
  -- excluded from the CO2 sum but tracked so a data-quality gap is visible
  -- in the snapshot rather than silently undercounting.
  unrated_tree_count        INTEGER         NOT NULL DEFAULT 0 CHECK (unrated_tree_count >= 0),

  -- Total estimated CO2 sequestered to date, across all active trees
  total_co2_offset_kg       NUMERIC(16, 2)  NOT NULL CHECK (total_co2_offset_kg >= 0),
  total_co2_offset_tonnes   NUMERIC(16, 4)  NOT NULL CHECK (total_co2_offset_tonnes >= 0),

  -- Per-species rollup: [{ speciesSlug, activeTreeCount, co2OffsetKg, co2OffsetTonnes }]
  species_breakdown         JSONB           NOT NULL DEFAULT '[]',

  -- How long the calculation took, for monitoring/alerting on slow runs
  computed_in_ms            INTEGER         NOT NULL DEFAULT 0 CHECK (computed_in_ms >= 0),

  created_at                TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- Hot path: "get latest snapshot" / "get last N days"
CREATE INDEX IF NOT EXISTS idx_carbon_offset_snapshots_date
  ON carbon_offset_snapshots (snapshot_date DESC);
