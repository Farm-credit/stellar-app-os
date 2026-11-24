// Copyright 2024 Farm-credit Contributors
// Licensed under the Apache License, Version 2.0

/**
 * Land Plot Audit — pure cross-check logic tests.
 *
 * These tests exercise the decision function directly with synthetic satellite
 * evidence, so no network or mock fetch is required.
 */

import { describe, expect, it } from 'vitest';

import {
  BARE_NDVI_MAX,
  MAX_CLOUD_COVERAGE_PERCENT,
  NDVI_LOWER_BOUNDS,
  auditClaimAgainstNdvi,
  computeConfidence,
  evidenceFromStatistics,
  getExpectedNdviBound,
  validateGroundPlantingClaim,
  type GroundPlantingClaim,
  type SatelliteNdviEvidence,
} from './landPlotAudit';
import { type NdviStatistics } from './copernicusNdviApi';

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makeClaim(overrides: Partial<GroundPlantingClaim> = {}): GroundPlantingClaim {
  return {
    plotId: 'plot-001',
    plotAreaHectares: 2.5,
    bounds: { north: 7.4, south: 7.3, east: 5.2, west: 5.1 },
    claimedStatus: 'planted',
    claimedAt: '2025-01-15',
    ...overrides,
  };
}

function makeEvidence(overrides: Partial<SatelliteNdviEvidence> = {}): SatelliteNdviEvidence {
  return {
    meanNdvi: 0.6,
    sampleCount: 500,
    imageDate: '2025-01-20',
    source: 'copernicus-sentinel-2',
    ...overrides,
  };
}

// ── Thresholds & bound lookup ────────────────────────────────────────────────

describe('getExpectedNdviBound', () => {
  it('returns lower-bound thresholds for vegetation-present claims', () => {
    expect(getExpectedNdviBound('planted')).toEqual({ bound: NDVI_LOWER_BOUNDS.planted, direction: 'lower' });
    expect(getExpectedNdviBound('maintenance')).toEqual({
      bound: NDVI_LOWER_BOUNDS.maintenance,
      direction: 'lower',
    });
    expect(getExpectedNdviBound('established')).toEqual({
      bound: NDVI_LOWER_BOUNDS.established,
      direction: 'lower',
    });
  });

  it('returns an upper-bound threshold for bare claims', () => {
    expect(getExpectedNdviBound('bare')).toEqual({ bound: BARE_NDVI_MAX, direction: 'upper' });
  });

  it('uses thresholds aligned with lib/satellite vegetation classes', () => {
    expect(NDVI_LOWER_BOUNDS.planted).toBe(0.2);
    expect(NDVI_LOWER_BOUNDS.maintenance).toBe(0.35);
    expect(NDVI_LOWER_BOUNDS.established).toBe(0.5);
    expect(BARE_NDVI_MAX).toBe(0.2);
  });
});

// ── Validation ───────────────────────────────────────────────────────────────

describe('validateGroundPlantingClaim', () => {
  it('accepts a claim with bounds', () => {
    expect(validateGroundPlantingClaim(makeClaim())).toEqual([]);
  });

  it('accepts a claim with coordinates instead of bounds', () => {
    const claim = makeClaim({ bounds: undefined, coordinates: { latitude: 7.35, longitude: 5.1 } });
    expect(validateGroundPlantingClaim(claim)).toEqual([]);
  });

  it('rejects a claim missing both bounds and coordinates', () => {
    const issues = validateGroundPlantingClaim(
      makeClaim({ bounds: undefined, coordinates: undefined })
    );
    expect(issues.some((i) => i.field === 'bounds')).toBe(true);
  });

  it('rejects an invalid plotId and non-positive area', () => {
    const issues = validateGroundPlantingClaim(makeClaim({ plotId: '', plotAreaHectares: 0 }));
    expect(issues.some((i) => i.field === 'plotId')).toBe(true);
    expect(issues.some((i) => i.field === 'plotAreaHectares')).toBe(true);
  });

  it('rejects inverted bounds', () => {
    const issues = validateGroundPlantingClaim(
      makeClaim({ bounds: { north: 1, south: 2, east: 3, west: 4 } })
    );
    expect(issues.some((i) => i.field === 'bounds.north')).toBe(true);
    expect(issues.some((i) => i.field === 'bounds.east')).toBe(true);
  });

  it('rejects an invalid claimedAt date', () => {
    const issues = validateGroundPlantingClaim(makeClaim({ claimedAt: 'not-a-date' }));
    expect(issues.some((i) => i.field === 'claimedAt')).toBe(true);
  });
});

// ── Verdicts ─────────────────────────────────────────────────────────────────

describe('auditClaimAgainstNdvi — verdicts', () => {
  it('confirms a planted claim when NDVI meets the threshold', () => {
    const result = auditClaimAgainstNdvi(makeClaim({ claimedStatus: 'planted' }), makeEvidence({ meanNdvi: 0.6 }));
    expect(result.verdict).toBe('confirmed');
    expect(result.confidenceScore).toBe(100);
  });

  it('disputes a planted claim when NDVI is below the threshold', () => {
    const result = auditClaimAgainstNdvi(
      makeClaim({ claimedStatus: 'planted' }),
      makeEvidence({ meanNdvi: 0.1 })
    );
    expect(result.verdict).toBe('disputed');
    expect(result.confidenceScore).toBeLessThan(100);
  });

  it('confirms a maintenance claim at NDVI 0.35 and disputes below it', () => {
    expect(
      auditClaimAgainstNdvi(makeClaim({ claimedStatus: 'maintenance' }), makeEvidence({ meanNdvi: 0.4 })).verdict
    ).toBe('confirmed');
    expect(
      auditClaimAgainstNdvi(makeClaim({ claimedStatus: 'maintenance' }), makeEvidence({ meanNdvi: 0.3 })).verdict
    ).toBe('disputed');
  });

  it('confirms an established claim at NDVI 0.5 and disputes below it', () => {
    expect(
      auditClaimAgainstNdvi(makeClaim({ claimedStatus: 'established' }), makeEvidence({ meanNdvi: 0.55 })).verdict
    ).toBe('confirmed');
    expect(
      auditClaimAgainstNdvi(makeClaim({ claimedStatus: 'established' }), makeEvidence({ meanNdvi: 0.45 })).verdict
    ).toBe('disputed');
  });

  it('confirms a bare claim when NDVI is low and disputes when vegetation is present', () => {
    expect(
      auditClaimAgainstNdvi(makeClaim({ claimedStatus: 'bare' }), makeEvidence({ meanNdvi: 0.05 })).verdict
    ).toBe('confirmed');
    expect(
      auditClaimAgainstNdvi(makeClaim({ claimedStatus: 'bare' }), makeEvidence({ meanNdvi: 0.4 })).verdict
    ).toBe('disputed');
  });

  it('returns insufficient_data when there are no valid pixels', () => {
    const result = auditClaimAgainstNdvi(makeClaim(), makeEvidence({ sampleCount: 0 }));
    expect(result.verdict).toBe('insufficient_data');
    expect(result.confidenceScore).toBe(0);
  });

  it('returns insufficient_data when cloud coverage exceeds the ceiling', () => {
    const result = auditClaimAgainstNdvi(
      makeClaim(),
      makeEvidence({ cloudCoveragePercent: MAX_CLOUD_COVERAGE_PERCENT + 10 })
    );
    expect(result.verdict).toBe('insufficient_data');
  });
});

// ── Confidence ───────────────────────────────────────────────────────────────

describe('computeConfidence', () => {
  it('is in [0, 100] and increases with valid pixel count', () => {
    const lowPixels = computeConfidence(makeEvidence({ sampleCount: 10, meanNdvi: 0.6 }), 0.4);
    const highPixels = computeConfidence(makeEvidence({ sampleCount: 1000, meanNdvi: 0.6 }), 0.4);
    expect(lowPixels).toBeGreaterThanOrEqual(0);
    expect(highPixels).toBeLessThanOrEqual(100);
    expect(highPixels).toBeGreaterThan(lowPixels);
  });

  it('penalises cloud coverage and borderline margins', () => {
    const clear = computeConfidence(makeEvidence({ sampleCount: 500, cloudCoveragePercent: 0 }), 0.4);
    const cloudy = computeConfidence(makeEvidence({ sampleCount: 500, cloudCoveragePercent: 80 }), 0.4);
    const borderline = computeConfidence(makeEvidence({ sampleCount: 500 }), 0.01);

    expect(clear).toBeGreaterThan(cloudy);
    expect(clear).toBeGreaterThan(borderline);
  });

  it('produces deterministic values for fixed inputs', () => {
    expect(computeConfidence(makeEvidence({ sampleCount: 500 }), 0.4)).toBe(100);
    expect(computeConfidence(makeEvidence({ sampleCount: 500, meanNdvi: 0.1 }), -0.1)).toBe(87);
    expect(computeConfidence(makeEvidence({ sampleCount: 500, cloudCoveragePercent: 50 }), 0.4)).toBe(90);
  });
});

// ── Result shape ─────────────────────────────────────────────────────────────

describe('auditClaimAgainstNdvi — result shape', () => {
  it('populates expected range, reasoning, and metadata', () => {
    const result = auditClaimAgainstNdvi(
      makeClaim({ claimedStatus: 'established', claimedTreeCount: 1100, speciesSlug: 'teak' }),
      makeEvidence({ meanNdvi: 0.55 })
    );

    expect(result.plotId).toBe('plot-001');
    expect(result.verdict).toBe('confirmed');
    expect(result.expectedNdviRange).toEqual({ min: 0.5, max: 1 });
    expect(result.dataSource).toBe('copernicus-sentinel-2');
    expect(result.auditDate).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(result.reasoning.length).toBeGreaterThan(0);
    // Reasoning references the claimed tree count.
    expect(result.reasoning.some((r) => r.includes('1100'))).toBe(true);
    // Reasoning summarises the satellite evidence.
    expect(result.reasoning.some((r) => r.includes('mean NDVI'))).toBe(true);
  });

  it('uses an upper-bound expected range for bare claims', () => {
    const result = auditClaimAgainstNdvi(makeClaim({ claimedStatus: 'bare' }), makeEvidence({ meanNdvi: 0.05 }));
    expect(result.expectedNdviRange).toEqual({ min: -1, max: 0.2 });
  });
});

// ── evidenceFromStatistics ───────────────────────────────────────────────────

describe('evidenceFromStatistics', () => {
  it('maps NDVI statistics to audit evidence', () => {
    const stats: NdviStatistics = {
      meanNdvi: 0.42,
      stdevNdvi: 0.05,
      minNdvi: 0.2,
      maxNdvi: 0.6,
      meanEvi: 0.3,
      sampleCount: 1024,
      interval: { from: '2025-01-01T00:00:00Z', to: '2025-01-31T00:00:00Z' },
      source: 'copernicus-sentinel-2',
      collectionId: 'sentinel-2-l2a',
    };

    const evidence = evidenceFromStatistics(stats, 12);
    expect(evidence.meanNdvi).toBe(0.42);
    expect(evidence.sampleCount).toBe(1024);
    expect(evidence.imageDate).toBe('2025-01-31T00:00:00Z');
    expect(evidence.cloudCoveragePercent).toBe(12);
    expect(evidence.source).toBe('copernicus-sentinel-2');
  });

  it('handles a null interval', () => {
    const stats: NdviStatistics = {
      meanNdvi: 0,
      stdevNdvi: null,
      minNdvi: null,
      maxNdvi: null,
      meanEvi: null,
      sampleCount: 0,
      interval: null,
      source: 'copernicus-sentinel-2',
      collectionId: 'sentinel-2-l2a',
    };
    expect(evidenceFromStatistics(stats).imageDate).toBeNull();
  });
});
