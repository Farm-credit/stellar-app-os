/**
 * Ecosystem recovery score computation (#1155).
 *
 * Produces a single 0–100 composite score from four independently normalised
 * biodiversity signals:
 *
 *   Signal                 Weight   Rationale
 *   ─────────────────────  ──────   ──────────────────────────────────────────
 *   Acoustic complexity    30 %     Correlates with bird/insect richness
 *   Canopy cover           25 %     Structural habitat quality
 *   NDVI                   25 %     Photosynthetic productivity proxy
 *   Species richness gain  20 %     New species vs. baseline = recovery signal
 *
 * All weights are intentionally explicit constants so the methodology can be
 * peer-reviewed and updated without touching the computation logic.
 */

import type { EcosystemRecoverySnapshot, RecoveryStatus } from '@/lib/types/biodiversity';

// ── Weight constants (must sum to 1.0) ───────────────────────────────────────
const W_ACI = 0.30;
const W_CANOPY = 0.25;
const W_NDVI = 0.25;
const W_RICHNESS = 0.20;

// ── Recovery-status thresholds ───────────────────────────────────────────────
const THRESHOLDS: Array<[number, RecoveryStatus]> = [
  [85, 'recovered'],
  [60, 'recovering'],
  [35, 'early-recovery'],
  [15, 'baseline'],
  [0, 'degraded'],
];

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

/**
 * Normalises ACI score (already 0–1) → 0–100 contribution.
 */
function aciComponent(aciScore: number): number {
  return clamp01(aciScore) * 100;
}

/**
 * Normalises canopy cover (0–100 %) → 0–100 contribution.
 * A cover of 70 %+ is considered fully recovered for this signal.
 */
function canopyComponent(coverPercent: number): number {
  const FULL_COVER = 70;
  return Math.min(coverPercent / FULL_COVER, 1) * 100;
}

/**
 * Normalises mean NDVI (0–1) → 0–100 contribution.
 * Dense tropical canopy typically reaches NDVI ≥ 0.7.
 */
function ndviComponent(ndviMean: number): number {
  const FULL_NDVI = 0.7;
  return Math.min(clamp01(ndviMean) / FULL_NDVI, 1) * 100;
}

/**
 * Species richness gain component.
 *
 * `newSpecies` are species detected after the baseline was set.
 * We treat gaining 20+ new species as a "full recovery" signal for
 * this component (tuneable via TARGET_NEW_SPECIES).
 */
function richnessComponent(newSpeciesSinceBaseline: number): number {
  const TARGET_NEW_SPECIES = 20;
  return Math.min(newSpeciesSinceBaseline / TARGET_NEW_SPECIES, 1) * 100;
}

/**
 * Maps a composite score to a human-readable recovery status.
 */
export function scoreToRecoveryStatus(score: number): RecoveryStatus {
  for (const [threshold, status] of THRESHOLDS) {
    if (score >= threshold) return status;
  }
  return 'degraded';
}

export interface RecoveryScoreInput {
  aciScore: number;
  canopyCoverPercent: number;
  ndviMean: number;
  newSpeciesSinceBaseline: number;
}

/**
 * Computes the composite ecosystem recovery score (0–100).
 */
export function computeRecoveryScore(input: RecoveryScoreInput): {
  score: number;
  status: RecoveryStatus;
  components: {
    aci: number;
    canopy: number;
    ndvi: number;
    richness: number;
  };
} {
  const aci = aciComponent(input.aciScore);
  const canopy = canopyComponent(input.canopyCoverPercent);
  const ndvi = ndviComponent(input.ndviMean);
  const richness = richnessComponent(input.newSpeciesSinceBaseline);

  const score = round2(W_ACI * aci + W_CANOPY * canopy + W_NDVI * ndvi + W_RICHNESS * richness);
  const status = scoreToRecoveryStatus(score);

  return {
    score,
    status,
    components: {
      aci: round2(aci),
      canopy: round2(canopy),
      ndvi: round2(ndvi),
      richness: round2(richness),
    },
  };
}

/**
 * Builds a full EcosystemRecoverySnapshot from raw aggregated inputs.
 */
export function buildRecoverySnapshot(params: {
  regionKey: string;
  snapshotDate: string;
  totalSpeciesCount: number;
  baselineSpeciesCount: number;
  threatenedSpeciesCount: number;
  aciScore: number;
  canopyCoverPercent: number;
  ndviMean: number;
  lastUpdatedAt: string;
}): EcosystemRecoverySnapshot {
  const newSpecies = Math.max(0, params.totalSpeciesCount - params.baselineSpeciesCount);
  const threatenedPercent =
    params.totalSpeciesCount > 0
      ? round2((params.threatenedSpeciesCount / params.totalSpeciesCount) * 100)
      : 0;

  const { score, status } = computeRecoveryScore({
    aciScore: params.aciScore,
    canopyCoverPercent: params.canopyCoverPercent,
    ndviMean: params.ndviMean,
    newSpeciesSinceBaseline: newSpecies,
  });

  return {
    regionKey: params.regionKey,
    snapshotDate: params.snapshotDate,
    totalSpeciesCount: params.totalSpeciesCount,
    newSpeciesSinceBaseline: newSpecies,
    threatenedSpeciesPercent: threatenedPercent,
    meanAciScore: round2(params.aciScore),
    canopyCoverPercent: round2(params.canopyCoverPercent),
    ndviMean: round2(params.ndviMean),
    recoveryScore: score,
    recoveryStatus: status,
    lastUpdatedAt: params.lastUpdatedAt,
  };
}
