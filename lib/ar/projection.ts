import type { Tree } from '@/lib/types/tree';
import type { TreeARProjection, TreeProjectionYear } from '@/lib/types/tree-ar';
import { TREE_MATURITY_YEARS, growthAtYear } from '@/lib/tree-growth/model';

/**
 * Builds the 20-year growth projection used by the WebAR viewer
 * (Issue #1106): what a sponsor's tree will look like at maturity, with the
 * measurements used to anchor the on-screen overlay.
 */

/** The AR slider always spans the full projection, planted or not. */
export const AR_PROJECTION_YEARS = TREE_MATURITY_YEARS;

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

export function ageInYears(plantedAt: string | null, nowMs: number): number {
  if (!plantedAt) return 0;
  const plantedMs = new Date(plantedAt).getTime();
  if (!Number.isFinite(plantedMs) || nowMs <= plantedMs) return 0;
  return (nowMs - plantedMs) / MS_PER_YEAR;
}

/** Height in metres for display, e.g. "12.4 m". */
export function formatHeight(cm: number): string {
  if (cm < 100) return `${cm} cm`;
  return `${(cm / 100).toFixed(1)} m`;
}

/** Relative size of the tree at `year`, 0–1, against the mature height. */
export function projectionScale(heightCm: number, matureHeightCm: number): number {
  if (matureHeightCm <= 0) return 0;
  return Math.min(Math.max(heightCm / matureHeightCm, 0), 1);
}

interface BuildProjectionOptions {
  /** Clock used to work out the tree's age today. Defaults to the growth anchor. */
  nowMs?: number;
  /** Fixed anchor matching the growth story so renders stay deterministic. */
  anchorMs?: number;
}

/**
 * Builds the full 0–20 year projection. Measurements come from the shared
 * growth model, so the AR view and the photo timeline never disagree.
 */
export function buildTreeARProjection(
  tree: Tree,
  options: BuildProjectionOptions = {}
): TreeARProjection {
  const plantedAt = tree.plantedAt ?? null;
  const nowMs = options.nowMs ?? options.anchorMs ?? Date.now();
  const rawAge = ageInYears(plantedAt, nowMs);
  const currentAgeYears = Math.min(Math.floor(rawAge), AR_PROJECTION_YEARS);

  const timeline: TreeProjectionYear[] = Array.from(
    { length: AR_PROJECTION_YEARS + 1 },
    (_, year) => {
      const snapshot = growthAtYear(tree.species, year);
      return {
        year,
        heightCm: snapshot.heightCm,
        canopyCm: snapshot.canopyCm,
        trunkMm: snapshot.trunkMm,
        annualCo2Kg: snapshot.annualCo2Kg,
        cumulativeCo2Kg: snapshot.cumulativeCo2Kg,
        maturityProgress: snapshot.maturityProgress,
        scale: 0,
      };
    }
  );

  const mature = timeline[AR_PROJECTION_YEARS];
  for (const entry of timeline) {
    entry.scale = projectionScale(entry.heightCm, mature.heightCm);
  }

  const lifetimeCo2Kg = mature.cumulativeCo2Kg;

  return {
    treeId: tree.treeId,
    species: tree.species,
    region: tree.region,
    projectName: tree.projectName,
    plantedAt,
    planted: Boolean(plantedAt),
    currentAgeYears,
    currentAgeLabel: `Age ${currentAgeYears}`,
    // Open on maturity: the promise of the sponsorship is the point of the view.
    defaultYear: AR_PROJECTION_YEARS,
    timeline,
    matureHeightCm: mature.heightCm,
    matureCanopyCm: mature.canopyCm,
    matureTrunkMm: mature.trunkMm,
    lifetimeCo2Kg,
    lifetimeCo2Tonnes: Math.round((lifetimeCo2Kg / 1000) * 100) / 100,
  };
}

/** Projection entry for one year, clamped into the 0–20 range. */
export function projectionYearAt(projection: TreeARProjection, year: number): TreeProjectionYear {
  const clamped = Math.min(Math.max(Math.round(year), 0), AR_PROJECTION_YEARS);
  return projection.timeline[clamped];
}

/** Share of maturity reached at a given year, e.g. "62% of maturity". */
export function maturityLabel(year: TreeProjectionYear): string {
  return `${Math.round(year.maturityProgress * 100)}% of maturity`;
}
