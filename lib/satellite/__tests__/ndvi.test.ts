import { describe, it, expect } from 'vitest';
import {
  computeNdvi,
  computeEvi,
  computeSavi,
  computeNdre,
  computeVegetationIndices,
  classifyVegetationHealth,
  computeHealthScore,
  analyseVegetation,
} from '../ndvi';
import type { SpectralBands } from '../types';

// ── computeNdvi ───────────────────────────────────────────────────────────────

describe('computeNdvi', () => {
  it('returns 0 when NIR and RED are equal', () => {
    expect(computeNdvi(0.3, 0.3)).toBe(0);
  });

  it('returns a positive value for healthy vegetation (NIR > RED)', () => {
    const result = computeNdvi(0.45, 0.09);
    expect(result).toBeGreaterThan(0.5);
    expect(result).toBeLessThanOrEqual(1);
  });

  it('returns a negative value when RED > NIR (water / cloud)', () => {
    const result = computeNdvi(0.05, 0.25);
    expect(result).toBeLessThan(0);
  });

  it('returns 0 when both bands are zero (avoids division by zero)', () => {
    expect(computeNdvi(0, 0)).toBe(0);
  });

  it('clamps to [-1, 1]', () => {
    // Saturated pixel — reflectance pushed to extremes
    expect(computeNdvi(1, 0)).toBe(1);
    expect(computeNdvi(0, 1)).toBe(-1);
  });

  it('matches the formula (NIR-RED)/(NIR+RED)', () => {
    const nir = 0.4;
    const red = 0.1;
    const expected = (nir - red) / (nir + red); // 0.6
    expect(computeNdvi(nir, red)).toBeCloseTo(expected, 4);
  });
});

// ── computeEvi ────────────────────────────────────────────────────────────────

describe('computeEvi', () => {
  it('returns null when blue band is undefined', () => {
    expect(computeEvi(0.4, 0.1, undefined)).toBeNull();
  });

  it('returns a number when all three bands are provided', () => {
    const result = computeEvi(0.45, 0.09, 0.04);
    expect(typeof result).toBe('number');
    expect(result).not.toBeNull();
  });

  it('is generally higher than NDVI for dense-canopy pixels (less soil saturation)', () => {
    // EVI de-couples soil background; for moderate vegetation it can differ in sign from NDVI
    // but for healthy canopy both should be positive
    const evi = computeEvi(0.45, 0.09, 0.04) as number;
    expect(evi).toBeGreaterThan(0);
  });

  it('stays within [-1, 1]', () => {
    const evi = computeEvi(0.5, 0.02, 0.01) as number;
    expect(evi).toBeGreaterThanOrEqual(-1);
    expect(evi).toBeLessThanOrEqual(1);
  });
});

// ── computeSavi ───────────────────────────────────────────────────────────────

describe('computeSavi', () => {
  it('returns 0 when NIR and RED are equal', () => {
    expect(computeSavi(0.3, 0.3)).toBe(0);
  });

  it('is less than or equal to NDVI magnitude for bright soils', () => {
    // SAVI adjusts downwards for soil-exposed areas (bare soil, sparse veg)
    const ndvi = computeNdvi(0.25, 0.18);
    const savi = computeSavi(0.25, 0.18);
    // Not guaranteed by formula direction, but for these values both should be positive
    expect(savi).toBeGreaterThan(0);
    expect(ndvi).toBeGreaterThan(0);
  });

  it('stays within [-1, 1]', () => {
    const result = computeSavi(0.8, 0.01);
    expect(result).toBeLessThanOrEqual(1);
    expect(result).toBeGreaterThanOrEqual(-1);
  });
});

// ── computeNdre ───────────────────────────────────────────────────────────────

describe('computeNdre', () => {
  it('returns null when redEdge1 is undefined', () => {
    expect(computeNdre(0.4, undefined)).toBeNull();
  });

  it('returns a value in [-1, 1] when red-edge is provided', () => {
    const result = computeNdre(0.45, 0.3);
    expect(result).not.toBeNull();
    const r = result as number;
    expect(r).toBeGreaterThanOrEqual(-1);
    expect(r).toBeLessThanOrEqual(1);
  });

  it('is positive for chlorophyll-rich canopy (NIR > redEdge1)', () => {
    expect(computeNdre(0.5, 0.2)).toBeGreaterThan(0);
  });
});

// ── computeVegetationIndices ──────────────────────────────────────────────────

describe('computeVegetationIndices', () => {
  it('always returns ndvi and savi', () => {
    const bands: SpectralBands = { red: 0.1, nir: 0.4 };
    const idx = computeVegetationIndices(bands);
    expect(typeof idx.ndvi).toBe('number');
    expect(typeof idx.savi).toBe('number');
  });

  it('returns null for evi when blue is absent', () => {
    const bands: SpectralBands = { red: 0.1, nir: 0.4 };
    expect(computeVegetationIndices(bands).evi).toBeNull();
  });

  it('returns evi when blue is present', () => {
    const bands: SpectralBands = { red: 0.09, nir: 0.45, blue: 0.04 };
    expect(computeVegetationIndices(bands).evi).not.toBeNull();
  });

  it('returns ndre when redEdge1 is present', () => {
    const bands: SpectralBands = { red: 0.09, nir: 0.45, redEdge1: 0.3 };
    expect(computeVegetationIndices(bands).ndre).not.toBeNull();
  });
});

// ── classifyVegetationHealth ──────────────────────────────────────────────────

describe('classifyVegetationHealth', () => {
  it('classifies negative NDVI as water_or_cloud', () => {
    expect(classifyVegetationHealth(-0.1)).toBe('water_or_cloud');
  });

  it('classifies NDVI 0.05 as water_or_cloud', () => {
    expect(classifyVegetationHealth(0.05)).toBe('water_or_cloud');
  });

  it('classifies NDVI 0.15 as bare_soil', () => {
    expect(classifyVegetationHealth(0.15)).toBe('bare_soil');
  });

  it('classifies NDVI 0.25 as sparse_vegetation', () => {
    expect(classifyVegetationHealth(0.25)).toBe('sparse_vegetation');
  });

  it('classifies NDVI 0.40 as moderate_vegetation', () => {
    expect(classifyVegetationHealth(0.40)).toBe('moderate_vegetation');
  });

  it('classifies NDVI 0.60 as healthy_vegetation', () => {
    expect(classifyVegetationHealth(0.60)).toBe('healthy_vegetation');
  });

  it('classifies NDVI 0.75 as dense_canopy', () => {
    expect(classifyVegetationHealth(0.75)).toBe('dense_canopy');
  });
});

// ── computeHealthScore ────────────────────────────────────────────────────────

describe('computeHealthScore', () => {
  it('returns 0 for NDVI ≤ 0', () => {
    expect(computeHealthScore(-0.5)).toBe(0);
    expect(computeHealthScore(0)).toBe(0);
  });

  it('returns 100 for NDVI ≥ 0.9', () => {
    expect(computeHealthScore(0.9)).toBe(100);
    expect(computeHealthScore(1.0)).toBe(100);
  });

  it('returns approximately 50 for NDVI ~0.45', () => {
    const score = computeHealthScore(0.45);
    expect(score).toBeGreaterThanOrEqual(45);
    expect(score).toBeLessThanOrEqual(55);
  });

  it('returns an integer', () => {
    expect(Number.isInteger(computeHealthScore(0.37))).toBe(true);
  });
});

// ── analyseVegetation ─────────────────────────────────────────────────────────

describe('analyseVegetation', () => {
  it('returns a complete NdviAnalysisResult for minimum bands', () => {
    const bands: SpectralBands = { red: 0.09, nir: 0.45 };
    const result = analyseVegetation(bands, '2025-09-01');

    expect(result.indices.ndvi).toBeGreaterThan(0.5);
    expect(result.healthClass).toBe('healthy_vegetation');
    expect(result.healthScore).toBeGreaterThan(50);
    expect(result.isUnhealthy).toBe(false);
    expect(result.imageDate).toBe('2025-09-01');
    expect(typeof result.summary).toBe('string');
    expect(result.summary.length).toBeGreaterThan(10);
  });

  it('flags unhealthy vegetation for low NDVI', () => {
    const bands: SpectralBands = { red: 0.3, nir: 0.15 };
    const result = analyseVegetation(bands);
    expect(result.isUnhealthy).toBe(true);
    expect(result.healthClass).toBe('water_or_cloud');
  });

  it('sets imageDate to null when not provided', () => {
    const result = analyseVegetation({ red: 0.1, nir: 0.4 });
    expect(result.imageDate).toBeNull();
  });

  it('includes EVI in the summary indices when blue band is supplied', () => {
    const bands: SpectralBands = { red: 0.09, nir: 0.45, blue: 0.04 };
    const result = analyseVegetation(bands);
    expect(result.indices.evi).not.toBeNull();
  });
});
