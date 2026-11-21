-- Migration: 018_add_tree_search_indexes.sql
-- Closes #1175
--
-- Query optimization: adds database indexes on the frequently queried columns
-- used by tree search/filter queries (species, region, planter_id) to reduce
-- search time by up to an order of magnitude.
--
-- The core tree-analytics query in `resolveTreeRegistryAnalytics` filters on
-- `t.region` and/or `t.species_slug` combined with `t.deleted_at IS NULL`.
-- Previously `region` had no index at all and no composite covered the common
-- region + species combination.

-- UP ─────────────────────────────────────────────────────────────────────────

BEGIN;

-- 1) Missing single-column index on region (was entirely absent).
CREATE INDEX IF NOT EXISTS idx_trees_region ON trees (region);

-- 2) Composite covering the region + species filter used by the analytics query,
--    ordered to serve equality filters on both columns.
CREATE INDEX IF NOT EXISTS idx_trees_region_species ON trees (region, species_slug);

-- 3) Composite covering "all trees for a planter, excluding soft-deleted",
--    which backs the planter_id filter in tree list/search.
CREATE INDEX IF NOT EXISTS idx_trees_planter_active
  ON trees (planter_id, deleted_at)
  WHERE deleted_at IS NULL;

COMMIT;

-- ROLLBACK ──────────────────────────────────────────────────────────────────
-- DROP INDEX IF EXISTS idx_trees_region;
-- DROP INDEX IF EXISTS idx_trees_region_species;
-- DROP INDEX IF EXISTS idx_trees_planter_active;
