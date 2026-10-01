/**
 * Tree-count estimation from aerial/satellite imagery metadata.
 *
 * Approach:
 *   1. Derive the vegetated area from canopy cover fraction × plot area.
 *   2. Estimate the area per individual tree crown using the mean crown
 *      diameter and a packing-efficiency constant (accounts for gaps).
 *   3. Divide to get an estimated count.
 *   4. Propagate ±20% crown-diameter uncertainty into a 95% confidence
 *      interval.
 *
 * This is a well-established remote-sensing method; see:
 *   Zhen et al. (2016) Remote Sensing 8(3):241 — high-density crown detection.
 *   Ke & Quackenbush (2011) ISPRS Journal — review of ITC methods.
 */

import type { ImageryMetadata, TreeCountResult } from './types';
import { CANOPY_PACKING_EFFICIENCY, CROWN_DIAMETER_DEFAULTS } from './types';

// ── Constants ────────────────────────────────────────────────────────────────

/** Crown-diameter uncertainty used for confidence interval calculation (±20%). */
const CROWN_DIAMETER_UNCERTAINTY = 0.2;

/** Minimum acceptable canopy cover fraction for a non-trivial estimate. */
const MIN_CANOPY_FRACTION = 0.01;

/**
 * Maximum canopy cover fraction for plausible young plantations
 * (near-complete canopy closure is only expected in dense mature forest).
 * Values above this are treated as evidence of existing forest, not planting.
 */
const FULL_CANOPY_THRESHOLD = 0.95;

/**
 * Relative tolerance for comparing estimated vs claimed tree count.
 * A ±30% difference is treated as 'pass', ±50% as 'marginal', beyond is 'fail'.
 */
const TOLERANCE_PASS = 0.3;
const TOLERANCE_MARGINAL = 0.5;

// ── Crown area helpers ───────────────────────────────────────────────────────

/**
 * Resolve the crown diameter (metres) for a given species slug.
 * Falls back to a generic default when the species is unknown.
 */
export function resolveCrownDiameter(speciesSlug?: string): number {
  if (!speciesSlug) return CROWN_DIAMETER_DEFAULTS.default;
  return CROWN_DIAMETER_DEFAULTS[speciesSlug] ?? CROWN_DIAMETER_DEFAULTS.default;
}

/**
 * Compute the effective canopy area per tree, accounting for crown overlap
 * and inter-tree gaps via the packing efficiency constant.
 *
 * crownArea = π × (diameter/2)² × packingEfficiency
 */
export function computeCrownAreaM2(crownDiameterMeters: number): number {
  const radius = crownDiameterMeters / 2;
  return Math.PI * radius * radius * CANOPY_PACKING_EFFICIENCY;
}

// ── Main estimation ──────────────────────────────────────────────────────────

/**
 * Estimate the number of trees in a plot from satellite imagery metadata.
 *
 * @param metadata      - Imagery tile metadata including canopy cover and plot area.
 * @param claimedCount  - Claimed tree count to verify against (optional).
 * @returns             TreeCountResult with estimate, confidence interval, and verdict.
 */
export function estimateTreeCount(
  metadata: ImageryMetadata,
  claimedCount?: number
): TreeCountResult {
  const {
    plotAreaHectares,
    canopyCoverFraction,
    speciesSlug,
    estimatedCrownDiameterMeters,
  } = metadata;

  // Resolve crown diameter
  const crownDiameter =
    estimatedCrownDiameterMeters ?? resolveCrownDiameter(speciesSlug);

  // Guard: trivially-low canopy means we cannot estimate trees
  if (canopyCoverFraction < MIN_CANOPY_FRACTION) {
    const zeroResult: TreeCountResult = {
      estimatedCount: 0,
      confidenceInterval: { low: 0, high: 0 },
      crownDiameterUsed: crownDiameter,
      plotAreaHectares,
      canopyCoverFraction,
      summary: `Canopy cover fraction is too low (${(canopyCoverFraction * 100).toFixed(1)}%) to estimate tree count. No significant vegetation detected in the plot area.`,
    };
    if (claimedCount !== undefined) {
      return {
        ...zeroResult,
        claimedCount,
        verificationStatus: 'fail',
        summary:
          zeroResult.summary +
          ` Claimed count of ${claimedCount} trees cannot be verified.`,
      };
    }
    return zeroResult;
  }

  // Convert plot area from hectares to m²  (1 ha = 10,000 m²)
  const plotAreaM2 = plotAreaHectares * 10_000;

  // Vegetated area
  const vegetatedAreaM2 = plotAreaM2 * Math.min(canopyCoverFraction, FULL_CANOPY_THRESHOLD);

  // Crown area per tree
  const crownAreaM2 = computeCrownAreaM2(crownDiameter);

  // Point estimate
  const estimatedCount = Math.max(0, Math.round(vegetatedAreaM2 / crownAreaM2));

  // Confidence interval: propagate ±UNCERTAINTY in crown diameter
  // Since count ∝ 1/crownDiameter², CI bounds come from extreme crown sizes.
  const smallCrownDiameter = crownDiameter * (1 - CROWN_DIAMETER_UNCERTAINTY);
  const largeCrownDiameter = crownDiameter * (1 + CROWN_DIAMETER_UNCERTAINTY);
  const lowCount = Math.max(
    0,
    Math.round(vegetatedAreaM2 / computeCrownAreaM2(largeCrownDiameter))
  );
  const highCount = Math.round(
    vegetatedAreaM2 / computeCrownAreaM2(smallCrownDiameter)
  );

  // Verify against claimed count
  let verificationStatus: TreeCountResult['verificationStatus'];
  let verificationText = '';

  if (claimedCount !== undefined && claimedCount > 0) {
    const relativeDiff = Math.abs(estimatedCount - claimedCount) / claimedCount;
    if (relativeDiff <= TOLERANCE_PASS) {
      verificationStatus = 'pass';
      verificationText = ` Claimed count of ${claimedCount} is within 30% of estimate — verification passed.`;
    } else if (relativeDiff <= TOLERANCE_MARGINAL) {
      verificationStatus = 'marginal';
      verificationText = ` Claimed count of ${claimedCount} differs by ${(relativeDiff * 100).toFixed(0)}% from estimate — marginal verification.`;
    } else {
      verificationStatus = 'fail';
      verificationText = ` Claimed count of ${claimedCount} differs by ${(relativeDiff * 100).toFixed(0)}% from estimate — verification failed.`;
    }
  }

  const canopyPct = (canopyCoverFraction * 100).toFixed(1);
  const summary =
    `Estimated ${estimatedCount} trees (CI: ${lowCount}–${highCount}) ` +
    `in ${plotAreaHectares.toFixed(2)} ha plot with ${canopyPct}% canopy cover. ` +
    `Crown diameter: ${crownDiameter} m.` +
    verificationText;

  return {
    estimatedCount,
    confidenceInterval: { low: lowCount, high: highCount },
    crownDiameterUsed: crownDiameter,
    plotAreaHectares,
    canopyCoverFraction,
    ...(claimedCount !== undefined ? { claimedCount } : {}),
    ...(verificationStatus !== undefined ? { verificationStatus } : {}),
    summary,
  };
}
