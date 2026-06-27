/**
 * Carbon Offset Impact service — Issue #545
 *
 * Aggregates a sponsor's CO2 offset, tree count, and per-species breakdown by
 * querying the mock CarbonCredits contract state (backed by existing tree
 * registry data). Results are cached per-sponsor for 30 s.
 *
 * Swap the mock layer for a real soroban-client call in production by replacing
 * the body of `queryContractForSponsor()`.
 */

import { getMockTrees } from '@/lib/api/mock/trees';
import { cacheGet, cacheSet } from '@/lib/api/tree-registry-cache';
import { CO2_KG_PER_TREE } from '@/lib/stellar/tree-asset';
import type { TreeSpecies } from '@/lib/types/tree';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SpeciesBreakdown {
  species: TreeSpecies;
  treeCount: number;
  co2OffsetKg: number;
  co2OffsetTonnes: number;
}

export interface SponsorImpact {
  sponsor: string;
  totalTrees: number;
  totalCo2OffsetKg: number;
  totalCo2OffsetTonnes: number;
  bySpecies: SpeciesBreakdown[];
  cachedAt: string;
}

// ── Contract query (mock layer) ───────────────────────────────────────────────

/**
 * Returns the list of trees attributed to `sponsor` from the mock contract
 * state. In production replace this with a soroban-client contractQuery call
 * against the deployed CarbonCredits contract address.
 */
function queryContractForSponsor(sponsor: string): { species: TreeSpecies; co2KgPerYear: number }[] {
  const all = getMockTrees();

  // Deterministic sponsor attribution: use the sponsor address checksum to
  // pick a stable subset so different addresses return different data in dev.
  const hash = [...sponsor].reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return all
    .filter((_, i) => (i + hash) % 3 !== 0) // drop ~1/3 depending on address
    .map((t) => ({ species: t.species, co2KgPerYear: t.co2OffsetKgPerYear }));
}

// ── Aggregation ───────────────────────────────────────────────────────────────

function aggregate(
  records: { species: TreeSpecies; co2KgPerYear: number }[]
): { bySpecies: SpeciesBreakdown[]; totalTrees: number; totalCo2OffsetKg: number } {
  const speciesMap = new Map<TreeSpecies, { count: number; co2Kg: number }>();

  for (const r of records) {
    const existing = speciesMap.get(r.species) ?? { count: 0, co2Kg: 0 };
    speciesMap.set(r.species, {
      count: existing.count + 1,
      co2Kg: existing.co2Kg + (r.co2KgPerYear ?? CO2_KG_PER_TREE),
    });
  }

  const bySpecies: SpeciesBreakdown[] = [...speciesMap.entries()].map(([species, { count, co2Kg }]) => ({
    species,
    treeCount: count,
    co2OffsetKg: Math.round(co2Kg),
    co2OffsetTonnes: parseFloat((co2Kg / 1_000).toFixed(4)),
  }));

  // Sort by tree count descending for readability
  bySpecies.sort((a, b) => b.treeCount - a.treeCount);

  const totalCo2OffsetKg = bySpecies.reduce((s, b) => s + b.co2OffsetKg, 0);

  return { bySpecies, totalTrees: records.length, totalCo2OffsetKg };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns the carbon offset impact for a sponsor address.
 * Caches the result for 30 s per sponsor.
 * Returns a zero-impact object (not a 404) when the sponsor has no records.
 */
export async function getSponsorImpact(sponsor: string): Promise<SponsorImpact> {
  const cacheKey = `carbon-impact:${sponsor}`;
  const cached = cacheGet<SponsorImpact>(cacheKey);
  if (cached) return cached;

  const records = queryContractForSponsor(sponsor);
  const { bySpecies, totalTrees, totalCo2OffsetKg } = aggregate(records);

  const result: SponsorImpact = {
    sponsor,
    totalTrees,
    totalCo2OffsetKg,
    totalCo2OffsetTonnes: parseFloat((totalCo2OffsetKg / 1_000).toFixed(4)),
    bySpecies,
    cachedAt: new Date().toISOString(),
  };

  cacheSet(cacheKey, result);
  return result;
}

/**
 * Validates a Stellar public key (G…, 56 chars, base32 charset).
 */
export function isValidStellarAddress(addr: string): boolean {
  return /^G[A-Z2-7]{55}$/.test(addr);
}
