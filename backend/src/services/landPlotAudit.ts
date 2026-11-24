// Copyright 2024 Farm-credit Contributors
// Licensed under the Apache License, Version 2.0

/**
 * Land Plot Audit — cross-checks a ground planting claim against satellite
 * NDVI vegetation density.
 *
 * This module contains the *pure decision logic*: given a steward's claim
 * (e.g. "vegetation established on this plot") and satellite NDVI evidence
 * fetched from the Copernicus Sentinel-2 API, it decides whether the claim is
 * confirmed, disputed, or cannot be assessed for lack of data, and explains
 * the reasoning.
 *
 * Thresholds mirror the vegetation-health bands in lib/satellite/types.ts:
 *   < 0.2  → bare soil / sparse
 *   0.2–0.35 → sparse vegetation
 *   0.35–0.5 → moderate vegetation
 *   ≥ 0.5  → healthy / established canopy
 */

import type { NdviStatistics, SatelliteImageBounds } from './copernicusNdviApi';

// ── Claim & result types ──────────────────────────────────────────────────────

/**
 * What a steward claims about the vegetation state of a plot at a given date.
 * Each status maps to an expected NDVI band (see NDVI_LOWER_BOUNDS /
 * BARE_NDVI_MAX).
 */
export type ClaimedVegetationStatus = 'bare' | 'planted' | 'maintenance' | 'established';

/** A ground planting claim submitted by a farmer/steward for audit. */
export interface GroundPlantingClaim {
  /** Unique plot identifier. */
  plotId: string;
  /** Plot area in hectares (informational; used in reasoning). */
  plotAreaHectares: number;
  /** Plot centroid (decimal degrees). Used when `bounds` is absent. */
  coordinates?: { latitude: number; longitude: number };
  /** Plot bounding box (decimal degrees). Preferred over `coordinates`. */
  bounds?: SatelliteImageBounds;
  /** Vegetation status the steward claims for the plot. */
  claimedStatus: ClaimedVegetationStatus;
  /** ISO-8601 date the claim pertains to (acquisition window is centred here). */
  claimedAt: string;
  /** Claimed tree count (informational; included in reasoning when present). */
  claimedTreeCount?: number;
  /** Species slug (informational; included in reasoning when present). */
  speciesSlug?: string;
}

/** Satellite NDVI evidence used to audit a claim. */
export interface SatelliteNdviEvidence {
  meanNdvi: number;
  stdevNdvi?: number | null;
  minNdvi?: number | null;
  maxNdvi?: number | null;
  meanEvi?: number | null;
  sampleCount: number;
  imageDate: string | null;
  /** Data source label, e.g. 'copernicus-sentinel-2'. */
  source: string;
  /** Cloud coverage percentage if known (0–100). */
  cloudCoveragePercent?: number;
}

export type AuditVerdict = 'confirmed' | 'disputed' | 'insufficient_data';

/** Full audit result returned to verifiers and the UI. */
export interface LandPlotAuditResult {
  plotId: string;
  verdict: AuditVerdict;
  claim: GroundPlantingClaim;
  evidence: SatelliteNdviEvidence;
  /** NDVI band the claim was tested against: {min} for lower-bound claims,
   * {max} for upper-bound (bare) claims. */
  expectedNdviRange: { min: number; max: number };
  confidenceScore: number;
  reasoning: string[];
  auditDate: string;
  dataSource: string;
}

// ── Thresholds (exported for tests & UI transparency) ────────────────────────

/** Minimum mean NDVI required to support each "vegetation present" claim. */
export const NDVI_LOWER_BOUNDS: Record<Exclude<ClaimedVegetationStatus, 'bare'>, number> = {
  planted: 0.2,
  maintenance: 0.35,
  established: 0.5,
};

/** Maximum mean NDVI consistent with a "bare" claim. */
export const BARE_NDVI_MAX = 0.2;

/** Fewer than this many valid pixels/observations means we cannot conclude. */
export const MIN_SAMPLE_COUNT = 1;

/** Cloud coverage above this means the image cannot reliably audit the plot. */
export const MAX_CLOUD_COVERAGE_PERCENT = 75;

/** Observed NDVI within this distance of the threshold is "borderline". */
export const EDGE_TOLERANCE = 0.03;

/** NDVI margin at which the evidence is considered unambiguous. */
export const MARGIN_FULL_CONFIDENCE = 0.3;

// ── Expected-bound lookup ─────────────────────────────────────────────────────

export interface ExpectedBound {
  bound: number;
  direction: 'lower' | 'upper';
}

/** Return the NDVI bound and direction a given claim is tested against. */
export function getExpectedNdviBound(claimedStatus: ClaimedVegetationStatus): ExpectedBound {
  if (claimedStatus === 'bare') return { bound: BARE_NDVI_MAX, direction: 'upper' };
  return { bound: NDVI_LOWER_BOUNDS[claimedStatus], direction: 'lower' };
}

// ── Validation ───────────────────────────────────────────────────────────────

export interface ClaimValidationIssue {
  field: string;
  message: string;
}

/** Validate a ground planting claim before auditing. Returns issues (empty = ok). */
export function validateGroundPlantingClaim(claim: GroundPlantingClaim): ClaimValidationIssue[] {
  const issues: ClaimValidationIssue[] = [];

  if (!claim.plotId || claim.plotId.trim() === '') {
    issues.push({ field: 'plotId', message: 'plotId is required.' });
  }
  if (!Number.isFinite(claim.plotAreaHectares) || claim.plotAreaHectares <= 0) {
    issues.push({ field: 'plotAreaHectares', message: 'plotAreaHectares must be a positive number.' });
  }
  if (!claim.bounds && !claim.coordinates) {
    issues.push({
      field: 'bounds',
      message: 'Either bounds or coordinates must be provided to locate the plot.',
    });
  }
  if (claim.bounds) {
    const { north, south, east, west } = claim.bounds;
    if (north <= south) {
      issues.push({ field: 'bounds.north', message: 'bounds.north must exceed bounds.south.' });
    }
    if (east <= west) {
      issues.push({ field: 'bounds.east', message: 'bounds.east must exceed bounds.west.' });
    }
  }
  if (!claim.claimedStatus) {
    issues.push({ field: 'claimedStatus', message: 'claimedStatus is required.' });
  }
  if (!claim.claimedAt || Number.isNaN(Date.parse(claim.claimedAt))) {
    issues.push({ field: 'claimedAt', message: 'claimedAt must be a valid ISO-8601 date.' });
  }

  return issues;
}

// ── Core audit ───────────────────────────────────────────────────────────────

/**
 * Audit a ground planting claim against satellite NDVI evidence.
 *
 * Pure function: performs no I/O. Callers (e.g. `auditLandPlot` in the
 * verification service) fetch the satellite evidence and pass it in.
 *
 * @param claim    The steward's ground planting claim.
 * @param evidence Satellite NDVI evidence for the plot window.
 * @returns         Audit verdict, confidence, and human-readable reasoning.
 */
export function auditClaimAgainstNdvi(
  claim: GroundPlantingClaim,
  evidence: SatelliteNdviEvidence
): LandPlotAuditResult {
  const { bound, direction } = getExpectedNdviBound(claim.claimedStatus);
  const expectedNdviRange =
    direction === 'lower' ? { min: bound, max: 1 } : { min: -1, max: bound };

  const reasoning: string[] = [];

  reasoning.push(
    `Claim: plot "${claim.plotId}" reported as "${claim.claimedStatus}" ` +
      `(${direction === 'lower' ? `NDVI ≥ ${bound}` : `NDVI < ${bound}`}).`
  );

  reasoning.push(
    `Satellite evidence: mean NDVI ${formatNdvi(evidence.meanNdvi)} over ` +
      `${evidence.sampleCount} valid pixel(s) from ${evidence.source}` +
      `${evidence.imageDate ? ` (${evidence.imageDate})` : ''}.`
  );

  if (claim.claimedTreeCount !== undefined) {
    reasoning.push(`Claimed tree count: ${claim.claimedTreeCount}.`);
  }

  // ── Insufficient data? ────────────────────────────────────────────────────
  if (evidence.sampleCount < MIN_SAMPLE_COUNT) {
    reasoning.push(
      `Insufficient data: only ${evidence.sampleCount} valid pixel(s) ` +
        `(minimum ${MIN_SAMPLE_COUNT}). Cloud-free Sentinel-2 imagery may be unavailable for this window.`
    );
    return finalize(claim, evidence, 'insufficient_data', expectedNdviRange, reasoning, 0);
  }

  if (
    evidence.cloudCoveragePercent !== undefined &&
    evidence.cloudCoveragePercent > MAX_CLOUD_COVERAGE_PERCENT
  ) {
    reasoning.push(
      `Insufficient data: cloud coverage ${evidence.cloudCoveragePercent.toFixed(0)}% exceeds ` +
        `the ${MAX_CLOUD_COVERAGE_PERCENT}% audit ceiling.`
    );
    return finalize(claim, evidence, 'insufficient_data', expectedNdviRange, reasoning, 10);
  }

  // ── Confirmed / disputed ──────────────────────────────────────────────────
  const observed = evidence.meanNdvi;
  let verdict: AuditVerdict;
  let margin: number;

  if (direction === 'lower') {
    // Claim expects NDVI >= bound.
    margin = observed - bound;
    if (observed >= bound) {
      verdict = 'confirmed';
      reasoning.push(
        `Confirmed: observed NDVI ${formatNdvi(observed)} meets the ${formatNdvi(bound)} threshold ` +
          `for "${claim.claimedStatus}".`
      );
    } else {
      verdict = 'disputed';
      reasoning.push(
        `Disputed: observed NDVI ${formatNdvi(observed)} is below the ${formatNdvi(bound)} ` +
          `threshold expected for "${claim.claimedStatus}".`
      );
    }
  } else {
    // Bare claim expects NDVI < bound.
    margin = bound - observed;
    if (observed < bound) {
      verdict = 'confirmed';
      reasoning.push(
        `Confirmed: observed NDVI ${formatNdvi(observed)} is below ${formatNdvi(bound)}, ` +
          `consistent with a "bare" plot.`
      );
    } else {
      verdict = 'disputed';
      reasoning.push(
        `Disputed: observed NDVI ${formatNdvi(observed)} indicates vegetation, contradicting ` +
          `the "bare" claim (expected NDVI < ${formatNdvi(bound)}).`
      );
    }
  }

  const confidence = computeConfidence(evidence, margin);

  return finalize(claim, evidence, verdict, expectedNdviRange, reasoning, confidence);
}

// ── Confidence ───────────────────────────────────────────────────────────────

/**
 * Compute a 0–100 confidence score for an audit verdict.
 *
 * Confidence reflects how reliable the satellite evidence makes the verdict:
 *   - More valid pixels → higher confidence (up to +30).
 *   - Less cloud cover → higher confidence (up to -20 penalty for fully cloudy).
 *   - Larger margin between observed NDVI and the threshold → higher confidence
 *     (up to +20).
 *   - Borderline margins (within EDGE_TOLERANCE) → -10 (uncertain).
 */
export function computeConfidence(evidence: SatelliteNdviEvidence, margin: number): number {
  let score = 50;

  // Pixel coverage: full +30 at 200+ pixels.
  const pixelBonus = Math.min(30, (evidence.sampleCount / 200) * 30);
  score += pixelBonus;

  // Cloud penalty: up to -20.
  if (evidence.cloudCoveragePercent !== undefined) {
    score -= (clamp(evidence.cloudCoveragePercent, 0, 100) / 100) * 20;
  }

  // Margin bonus: full +20 at 0.3 NDVI margin.
  const absMargin = Math.abs(margin);
  score += Math.min(20, (absMargin / MARGIN_FULL_CONFIDENCE) * 20);

  // Borderline penalty.
  if (absMargin < EDGE_TOLERANCE) {
    score -= 10;
  }

  return Math.round(clamp(score, 0, 100));
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function finalize(
  claim: GroundPlantingClaim,
  evidence: SatelliteNdviEvidence,
  verdict: AuditVerdict,
  expectedNdviRange: { min: number; max: number },
  reasoning: string[],
  confidence: number
): LandPlotAuditResult {
  return {
    plotId: claim.plotId,
    verdict,
    claim,
    evidence,
    expectedNdviRange,
    confidenceScore: confidence,
    reasoning,
    auditDate: new Date().toISOString(),
    dataSource: evidence.source,
  };
}

function formatNdvi(value: number): string {
  return value.toFixed(3);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Build a SatelliteNdviEvidence from raw NDVI statistics (convenience). */
export function evidenceFromStatistics(
  stats: NdviStatistics,
  cloudCoveragePercent?: number
): SatelliteNdviEvidence {
  return {
    meanNdvi: stats.meanNdvi,
    stdevNdvi: stats.stdevNdvi,
    minNdvi: stats.minNdvi,
    maxNdvi: stats.maxNdvi,
    meanEvi: stats.meanEvi,
    sampleCount: stats.sampleCount,
    imageDate: stats.interval?.to ?? null,
    source: stats.source,
    cloudCoveragePercent,
  };
}
