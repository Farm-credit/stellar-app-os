/**
 * Types for the daily carbon-offset cron job — Issue #839
 *
 * Kept local to lib/carbon/ rather than appended to lib/db/schema.ts:
 * schema.ts's own docstring scopes it to migrations 003–006, and migration
 * 007 (webhook_dispatch) already established the newer convention of a
 * domain module owning its own row types (see lib/webhook/*).
 */

import type { TreeStatus } from '@/lib/db/schema';

/**
 * Tree lifecycle states that count as an "active plot" for this job.
 * 'completed' is included deliberately — it's a distinct status from
 * 'failed' in this schema, so it does not mean the tree died. See the
 * migration file for the full reasoning; this is the one place to change
 * it if a maintainer wants a narrower definition.
 */
export const ACTIVE_TREE_STATUSES: readonly TreeStatus[] = [
  'planted',
  'verified',
  'completed',
] as const;

/** One active tree, joined with its species' FAO/IPCC Tier-1 rate data. */
export interface ActiveTreeOffsetRecord {
  id: number;
  speciesSlug: string | null;
  plantedAt: Date;
  /** kg CO2 sequestered per year for this species (null if species unknown / unrated) */
  co2KgPerYear: number | null;
  /** Years to reach biomass maturity (used to cap the age used in the estimate) */
  maturityYears: number | null;
}

/** Per-species rollup within a single day's snapshot. */
export interface CarbonSpeciesBreakdown {
  speciesSlug: string;
  activeTreeCount: number;
  co2OffsetKg: number;
  co2OffsetTonnes: number;
}

/** Result of computing (but not yet persisting) one day's carbon offset snapshot. */
export interface CarbonSnapshotResult {
  snapshotDate: string; // 'YYYY-MM-DD'
  activeTreeCount: number;
  /** Active trees with no species / rate data — excluded from the totals */
  unratedTreeCount: number;
  totalCo2OffsetKg: number;
  totalCo2OffsetTonnes: number;
  bySpecies: CarbonSpeciesBreakdown[];
  computedInMs: number;
}

/** A snapshot as stored in / read from carbon_offset_snapshots. */
export interface CarbonOffsetSnapshotRow {
  id: number;
  snapshot_date: string; // DATE returned as 'YYYY-MM-DD' string by pg driver
  active_tree_count: number;
  unrated_tree_count: number;
  total_co2_offset_kg: string; // NUMERIC returned as string by pg driver
  total_co2_offset_tonnes: string;
  species_breakdown: CarbonSpeciesBreakdown[];
  computed_in_ms: number;
  created_at: Date;
  updated_at: Date;
}
