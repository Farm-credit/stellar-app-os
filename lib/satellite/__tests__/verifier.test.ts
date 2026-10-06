import { describe, it, expect } from 'vitest';
import { SatelliteVerifier, verifySatelliteData } from '../verifier';
import type { SatelliteVerificationRequest } from '../types';

// ── Fixtures ──────────────────────────────────────────────────────────────────

/** Healthy vegetation bands (Sentinel-2-style reflectance values). */
const HEALTHY_BANDS = {
  red:      0.09,
  nir:      0.45,
  blue:     0.04,
  green:    0.10,
  swir1:    0.12,
};

/** Bare-soil / deforested bands. */
const BARE_BANDS = {
  red:  0.28,
  nir:  0.15,
  blue: 0.06,
  green: 0.14,
};

const IMAGERY_META = {
  resolutionMetersPerPixel: 10,
  plotAreaHectares: 2.5,
  canopyCoverFraction: 0.55,
  estimatedCrownDiameterMeters: 6,
};

function makeRequest(
  overrides: Partial<SatelliteVerificationRequest> = {}
): SatelliteVerificationRequest {
  return {
    plotId: 'test-plot-01',
    coordinates: { latitude: 7.35, longitude: 5.1 },
    plotAreaHectares: 2.5,
    currentBands: HEALTHY_BANDS,
    imageryMetadata: IMAGERY_META,
    imageryDate: '2025-09-15',
    ...overrides,
  };
}

// ── SatelliteVerifier.verify ──────────────────────────────────────────────────

describe('SatelliteVerifier.verify', () => {
  const verifier = new SatelliteVerifier();

  it('returns a result with the correct plotId', () => {
    const result = verifier.verify(makeRequest({ plotId: 'my-plot' }));
    expect(result.plotId).toBe('my-plot');
  });

  it('sets verifiedAt to an ISO-8601 timestamp', () => {
    const result = verifier.verify(makeRequest());
    expect(() => new Date(result.verifiedAt)).not.toThrow();
    expect(new Date(result.verifiedAt).toISOString()).toBe(result.verifiedAt);
  });

  it('returns verdict insufficient_data for missing bands', () => {
    const req = makeRequest({ currentBands: { red: NaN, nir: 0.4 } });
    const result = verifier.verify(req);
    expect(result.verdict).toBe('insufficient_data');
    expect(result.confidenceScore).toBe(0);
    expect(result.flags.some((f) => f.code === 'MISSING_BANDS')).toBe(true);
  });

  it('returns verdict "verified" for healthy vegetation with matching tree count', () => {
    const req = makeRequest({
      claimedTreeCount: 1100, // close to ~1170 estimate for 2.5 ha, 55% cover, 6m crown
    });
    const result = verifier.verify(req);
    expect(['verified', 'partially_verified']).toContain(result.verdict);
    expect(result.confidenceScore).toBeGreaterThan(40);
  });

  it('includes a TREE_COUNT_MISMATCH critical flag when claimed count is way off', () => {
    const req = makeRequest({ claimedTreeCount: 50000 });
    const result = verifier.verify(req);
    const flag = result.flags.find((f) => f.code === 'TREE_COUNT_MISMATCH');
    expect(flag).toBeDefined();
    expect(flag?.severity).toBe('critical');
  });

  it('detects deforestation when baseline has more forest than current', () => {
    const req = makeRequest({
      currentBands: BARE_BANDS,
      baselineBands: HEALTHY_BANDS,
      baselineDate: '2023-01-01',
    });
    const result = verifier.verify(req);
    const dfFlag = result.flags.find((f) => f.code === 'DEFORESTATION_DETECTED');
    expect(dfFlag).toBeDefined();
    expect(dfFlag?.severity).toBe('critical');
    expect(result.verdict).toBe('failed');
  });

  it('confirms reforestation when current has more forest than baseline', () => {
    const req = makeRequest({
      currentBands: HEALTHY_BANDS,
      baselineBands: BARE_BANDS,
      baselineDate: '2023-01-01',
    });
    const result = verifier.verify(req);
    const refoFlag = result.flags.find((f) => f.code === 'REFORESTATION_CONFIRMED');
    expect(refoFlag).toBeDefined();
    expect(refoFlag?.severity).toBe('info');
  });

  it('adds NO_BASELINE flag when no baseline bands provided', () => {
    const req = makeRequest();
    const result = verifier.verify(req);
    expect(result.flags.some((f) => f.code === 'NO_BASELINE')).toBe(true);
    expect(result.landCoverChange).toBeNull();
  });

  it('includes vegetation analysis in the result', () => {
    const result = verifier.verify(makeRequest());
    expect(result.vegetation).toBeDefined();
    expect(result.vegetation.indices.ndvi).toBeGreaterThan(0);
    expect(typeof result.vegetation.healthScore).toBe('number');
  });

  it('includes a treeCount estimation in the result', () => {
    const result = verifier.verify(makeRequest());
    expect(result.treeCount).toBeDefined();
    expect(result.treeCount.estimatedCount).toBeGreaterThan(0);
    expect(result.treeCount.confidenceInterval.low).toBeLessThanOrEqual(result.treeCount.estimatedCount);
    expect(result.treeCount.confidenceInterval.high).toBeGreaterThanOrEqual(result.treeCount.estimatedCount);
  });

  it('confidence score is in [0, 100]', () => {
    const result = verifier.verify(makeRequest());
    expect(result.confidenceScore).toBeGreaterThanOrEqual(0);
    expect(result.confidenceScore).toBeLessThanOrEqual(100);
  });

  it('uses provided speciesSlug for crown diameter', () => {
    // Mangrove crown is 3m vs default 6m → higher tree count estimate
    const reqMangrove = makeRequest({ speciesSlug: 'mangrove' });
    const reqDefault  = makeRequest();
    const mangroveCount = verifier.verify(reqMangrove).treeCount.estimatedCount;
    const defaultCount  = verifier.verify(reqDefault).treeCount.estimatedCount;
    // Smaller crown → more trees fit
    expect(mangroveCount).toBeGreaterThan(defaultCount);
  });
});

// ── verifySatelliteData convenience function ──────────────────────────────────

describe('verifySatelliteData', () => {
  it('returns the same result as new SatelliteVerifier().verify()', () => {
    const req = makeRequest({ plotId: 'convenience-test' });
    const fromFn     = verifySatelliteData(req);
    const fromClass  = new SatelliteVerifier().verify(req);

    // The verdict and scores should be identical (timestamps differ by ms at most)
    expect(fromFn.verdict).toBe(fromClass.verdict);
    expect(fromFn.confidenceScore).toBe(fromClass.confidenceScore);
    expect(fromFn.vegetation.healthClass).toBe(fromClass.vegetation.healthClass);
    expect(fromFn.treeCount.estimatedCount).toBe(fromClass.treeCount.estimatedCount);
    expect(fromFn.flags.map((f) => f.code)).toEqual(fromClass.flags.map((f) => f.code));
  });
});

// ── Edge cases ────────────────────────────────────────────────────────────────

describe('SatelliteVerifier — edge cases', () => {
  const verifier = new SatelliteVerifier();

  it('handles zero canopy cover gracefully', () => {
    const req = makeRequest({
      imageryMetadata: { ...IMAGERY_META, canopyCoverFraction: 0 },
      claimedTreeCount: 500,
    });
    const result = verifier.verify(req);
    expect(result.treeCount.estimatedCount).toBe(0);
    expect(result.treeCount.verificationStatus).toBe('fail');
  });

  it('returns partially_verified or verified for a good plot with no claim', () => {
    const req = makeRequest();
    const result = verifier.verify(req);
    expect(['verified', 'partially_verified']).toContain(result.verdict);
  });

  it('handles very large plot areas without overflow', () => {
    const req = makeRequest({
      plotAreaHectares: 10_000,
      imageryMetadata: { ...IMAGERY_META, plotAreaHectares: 10_000 },
    });
    const result = verifier.verify(req);
    expect(result.treeCount.estimatedCount).toBeGreaterThan(0);
    expect(Number.isFinite(result.treeCount.estimatedCount)).toBe(true);
  });

  it('always populates the summary string on treeCount', () => {
    const result = verifier.verify(makeRequest());
    expect(typeof result.treeCount.summary).toBe('string');
    expect(result.treeCount.summary.length).toBeGreaterThan(0);
  });
});
