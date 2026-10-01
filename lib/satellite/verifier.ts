/**
 * SatelliteVerifier — orchestrates the full satellite environmental verification pipeline.
 *
 * Combines:
 *   1. NDVI / vegetation health analysis
 *   2. Tree-count estimation and claimed-count verification
 *   3. Land-cover change detection (when baseline bands are provided)
 *
 * Verdict logic:
 *   - 'verified'            — NDVI healthy + tree count passes + no deforestation
 *   - 'partially_verified'  — Some checks warn but no critical failures
 *   - 'failed'              — Any critical flag raised
 *   - 'insufficient_data'   — Not enough spectral data to produce a meaningful result
 *
 * Confidence scoring:
 *   Starts at 100 and deducts points per flag severity:
 *     critical: −30
 *     warning:  −15
 *     info:     − 5
 *   Then adds a bonus of up to +20 for reforestation confirmation and good NDVI.
 */

import { analyseVegetation } from './ndvi';
import { buildLandCoverSnapshot, detectLandCoverChange } from './landCover';
import { estimateTreeCount } from './treeCount';
import type {
  LandCoverChange,
  NdviAnalysisResult,
  SatelliteVerificationRequest,
  SatelliteVerificationResult,
  TreeCountResult,
  VerificationFlag,
} from './types';

// ── Confidence score weights ──────────────────────────────────────────────────

const CRITICAL_DEDUCTION = 30;
const WARNING_DEDUCTION = 15;
const INFO_DEDUCTION = 5;

const REFORESTATION_BONUS = 15;
const HEALTHY_NDVI_BONUS = 5;

// ── SatelliteVerifier ─────────────────────────────────────────────────────────

export class SatelliteVerifier {
  /**
   * Run a full satellite verification for a plot.
   *
   * @param request  - Verification request with spectral bands and metadata.
   * @returns        Full SatelliteVerificationResult.
   */
  verify(request: SatelliteVerificationRequest): SatelliteVerificationResult {
    const flags: VerificationFlag[] = [];

    // ── 1. Validate minimum required data ──────────────────────────────────
    if (!this.hasMinimumBands(request)) {
      return this.insufficientDataResult(request.plotId, flags);
    }

    // ── 2. Vegetation health (NDVI) ────────────────────────────────────────
    const vegetation = analyseVegetation(
      request.currentBands,
      request.imageryDate ?? null
    );
    this.collectVegetationFlags(vegetation, flags);

    // ── 3. Tree count estimation ───────────────────────────────────────────
    const treeCount = estimateTreeCount(
      {
        ...request.imageryMetadata,
        speciesSlug: request.speciesSlug ?? request.imageryMetadata.speciesSlug,
      },
      request.claimedTreeCount
    );
    this.collectTreeCountFlags(treeCount, flags);

    // ── 4. Land-cover change detection ────────────────────────────────────
    let landCoverChange: LandCoverChange | null = null;
    if (request.baselineBands) {
      const baselineDate = request.baselineDate ?? 'unknown';
      const currentDate = request.imageryDate ?? 'unknown';

      const baselineSnapshot = buildLandCoverSnapshot(request.baselineBands, baselineDate);
      const currentSnapshot = buildLandCoverSnapshot(request.currentBands, currentDate);
      landCoverChange = detectLandCoverChange(baselineSnapshot, currentSnapshot);
      this.collectLandCoverFlags(landCoverChange, flags);
    } else {
      flags.push({
        code: 'NO_BASELINE',
        severity: 'info',
        message:
          'No baseline imagery provided. Land-cover change detection was skipped.',
      });
    }

    // ── 5. Compute confidence and verdict ──────────────────────────────────
    const confidenceScore = this.computeConfidenceScore(flags, vegetation, landCoverChange);
    const verdict = this.computeVerdict(flags, confidenceScore);

    return {
      plotId: request.plotId,
      verifiedAt: new Date().toISOString(),
      vegetation,
      treeCount,
      landCoverChange,
      verdict,
      confidenceScore,
      flags,
    };
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private hasMinimumBands(request: SatelliteVerificationRequest): boolean {
    const { red, nir } = request.currentBands;
    return (
      typeof red === 'number' &&
      typeof nir === 'number' &&
      Number.isFinite(red) &&
      Number.isFinite(nir) &&
      red >= 0 &&
      nir >= 0
    );
  }

  private insufficientDataResult(
    plotId: string,
    flags: VerificationFlag[]
  ): SatelliteVerificationResult {
    flags.push({
      code: 'MISSING_BANDS',
      severity: 'critical',
      message:
        'Minimum required spectral bands (red + NIR) are missing or invalid. ' +
        'Verification cannot proceed.',
    });

    // Return minimal valid objects for downstream consumers
    return {
      plotId,
      verifiedAt: new Date().toISOString(),
      vegetation: {
        indices: { ndvi: 0, evi: null, savi: 0, ndre: null },
        healthClass: 'bare_soil',
        healthScore: 0,
        isUnhealthy: true,
        summary: 'Insufficient data to compute vegetation indices.',
        imageDate: null,
      },
      treeCount: {
        estimatedCount: 0,
        confidenceInterval: { low: 0, high: 0 },
        crownDiameterUsed: 0,
        plotAreaHectares: 0,
        canopyCoverFraction: 0,
        summary: 'Insufficient data to estimate tree count.',
      },
      landCoverChange: null,
      verdict: 'insufficient_data',
      confidenceScore: 0,
      flags,
    };
  }

  private collectVegetationFlags(
    vegetation: NdviAnalysisResult,
    flags: VerificationFlag[]
  ): void {
    if (vegetation.healthClass === 'water_or_cloud') {
      flags.push({
        code: 'CLOUD_OR_WATER',
        severity: 'warning',
        message:
          `NDVI (${vegetation.indices.ndvi.toFixed(3)}) indicates water or cloud cover. ` +
          'Vegetation assessment may be unreliable for this image date.',
      });
    } else if (vegetation.isUnhealthy) {
      flags.push({
        code: 'LOW_NDVI',
        severity: 'warning',
        message:
          `NDVI (${vegetation.indices.ndvi.toFixed(3)}) is below the healthy threshold (0.2). ` +
          'Vegetation cover is absent or severely stressed.',
      });
    }

    if (vegetation.healthClass === 'dense_canopy' || vegetation.healthClass === 'healthy_vegetation') {
      flags.push({
        code: 'HEALTHY_CANOPY',
        severity: 'info',
        message:
          `Strong vegetation signal detected (NDVI ${vegetation.indices.ndvi.toFixed(3)}, ` +
          `health score ${vegetation.healthScore}/100).`,
      });
    }
  }

  private collectTreeCountFlags(
    treeCount: TreeCountResult,
    flags: VerificationFlag[]
  ): void {
    if (treeCount.verificationStatus === 'fail') {
      flags.push({
        code: 'TREE_COUNT_MISMATCH',
        severity: 'critical',
        message:
          `Tree count verification failed. Estimated ${treeCount.estimatedCount} trees ` +
          `vs claimed ${treeCount.claimedCount ?? 'unknown'}. ${treeCount.summary}`,
      });
    } else if (treeCount.verificationStatus === 'marginal') {
      flags.push({
        code: 'TREE_COUNT_MARGINAL',
        severity: 'warning',
        message:
          `Tree count estimate is marginally consistent with claim. ` +
          `Estimated ${treeCount.estimatedCount} (CI: ${treeCount.confidenceInterval.low}–${treeCount.confidenceInterval.high}), ` +
          `claimed ${treeCount.claimedCount ?? 'unknown'}.`,
      });
    } else if (treeCount.verificationStatus === 'pass') {
      flags.push({
        code: 'TREE_COUNT_VERIFIED',
        severity: 'info',
        message:
          `Tree count verified. Estimated ${treeCount.estimatedCount} trees matches ` +
          `claimed ${treeCount.claimedCount ?? 'unknown'} within 30% tolerance.`,
      });
    }

    if (treeCount.estimatedCount === 0 && treeCount.canopyCoverFraction > 0.05) {
      flags.push({
        code: 'ZERO_TREES_LOW_CONFIDENCE',
        severity: 'warning',
        message:
          'Tree count estimate is zero despite non-trivial canopy cover. ' +
          'Check resolution and canopy cover inputs.',
      });
    }
  }

  private collectLandCoverFlags(
    change: LandCoverChange,
    flags: VerificationFlag[]
  ): void {
    if (change.deforestationDetected) {
      flags.push({
        code: 'DEFORESTATION_DETECTED',
        severity: 'critical',
        message:
          `Deforestation detected: forest fraction changed by ` +
          `${(change.forestFractionDelta * 100).toFixed(1)}% ` +
          `(${change.fromDate} → ${change.toDate}). ${change.narrative}`,
      });
    }

    if (change.reforestationConfirmed) {
      flags.push({
        code: 'REFORESTATION_CONFIRMED',
        severity: 'info',
        message:
          `Reforestation confirmed: forest fraction increased by ` +
          `${(change.forestFractionDelta * 100).toFixed(1)}% ` +
          `(${change.fromDate} → ${change.toDate}).`,
      });
    }

    if (change.changeMagnitude === 'significant' && !change.deforestationDetected && !change.reforestationConfirmed) {
      flags.push({
        code: 'SIGNIFICANT_LAND_CHANGE',
        severity: 'warning',
        message:
          `Significant land-cover change detected that does not clearly indicate ` +
          `reforestation or deforestation. Manual review recommended.`,
      });
    }
  }

  private computeConfidenceScore(
    flags: VerificationFlag[],
    vegetation: NdviAnalysisResult,
    landCoverChange: LandCoverChange | null
  ): number {
    let score = 100;

    for (const flag of flags) {
      if (flag.severity === 'critical') score -= CRITICAL_DEDUCTION;
      else if (flag.severity === 'warning') score -= WARNING_DEDUCTION;
      else score -= INFO_DEDUCTION;
    }

    // Positive bonuses
    if (landCoverChange?.reforestationConfirmed) {
      score += REFORESTATION_BONUS;
    }
    if (vegetation.healthScore >= 60) {
      score += HEALTHY_NDVI_BONUS;
    }

    return Math.max(0, Math.min(100, score));
  }

  private computeVerdict(
    flags: VerificationFlag[],
    confidenceScore: number
  ): SatelliteVerificationResult['verdict'] {
    const hasCritical = flags.some((f) => f.severity === 'critical');
    if (hasCritical) {
      // MISSING_BANDS is already handled separately; check for domain failures
      const domainCritical = flags.some(
        (f) => f.severity === 'critical' && f.code !== 'MISSING_BANDS'
      );
      if (domainCritical) return 'failed';
    }

    if (confidenceScore >= 70) return 'verified';
    if (confidenceScore >= 40) return 'partially_verified';
    return 'failed';
  }
}

/** Convenience function — creates a SatelliteVerifier and runs a single verification. */
export function verifySatelliteData(
  request: SatelliteVerificationRequest
): SatelliteVerificationResult {
  return new SatelliteVerifier().verify(request);
}
