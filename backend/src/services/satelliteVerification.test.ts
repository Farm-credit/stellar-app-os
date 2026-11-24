// Copyright 2024 Farm-credit Contributors
// Licensed under the Apache License, Version 2.0

/**
 * Satellite Verification Service Tests
 * Issue #1429
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  auditLandPlot,
  calculateAreaHectares,
  estimateJobCost,
  getSupportedProviders,
  type GroundPlantingClaim,
  type VerificationRequest,
} from './satelliteVerification';
import { clearCopernicusTokenCache, type CopernicusConfig } from './copernicusNdviApi';

describe('Satellite Verification Service', () => {
  const sampleBounds = {
    north: 37.8,
    south: 37.7,
    east: -122.3,
    west: -122.5,
  };

  const sampleRequest: VerificationRequest = {
    projectId: 'test-project-1',
    bounds: sampleBounds,
    verificationType: 'tree_count',
    startDate: '2024-01-01',
    endDate: '2024-12-31',
  };

  describe('calculateAreaHectares', () => {
    it('should calculate area for a known bounding box', () => {
      // ~0.1 degree ~ 11km at equator
      // This bounds is roughly 11km x 11km = 121 km² = 12,100 hectares
      const area = calculateAreaHectares(sampleBounds);
      expect(area).toBeGreaterThan(10000);
      expect(area).toBeLessThan(15000);
    });

    it('should return 0 for zero-area bounds', () => {
      const zeroBounds = { north: 0, south: 0, east: 0, west: 0 };
      expect(calculateAreaHectares(zeroBounds)).toBe(0);
    });
  });

  describe('estimateJobCost', () => {
    it('should estimate cost for tree_count verification', () => {
      const cost = estimateJobCost({
        ...sampleRequest,
        verificationType: 'tree_count',
      });
      expect(cost.currency).toBe('USD');
      expect(cost.estimatedCost).toBeGreaterThan(0);
    });

    it('should estimate lower cost for land_cover_change', () => {
      const treeCost = estimateJobCost({
        ...sampleRequest,
        verificationType: 'tree_count',
      });
      const landCost = estimateJobCost({
        ...sampleRequest,
        verificationType: 'land_cover_change',
      });
      expect(landCost.estimatedCost).toBeLessThan(treeCost.estimatedCost);
    });
  });

  describe('getSupportedProviders', () => {
    it('should return known satellite providers', () => {
      const providers = getSupportedProviders();
      expect(providers).toContain('sentinel-2');
      expect(providers).toContain('landsat-8');
      expect(providers).toContain('planet');
      expect(providers.length).toBe(3);
    });
  });
});

// ── Land plot audit (Sentinel/Copernicus NDVI cross-check) ──────────────────────

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

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

function ndviStatsPayload(meanNdvi: number, sampleCount = 500) {
  return {
    status: 'OK',
    data: [
      {
        interval: { from: '2025-01-01T00:00:00Z', to: '2025-01-31T00:00:00Z' },
        outputs: {
          ndvi: { bands: { B0: { stats: { mean: meanNdvi, stdev: 0.05, min: 0.4, max: 0.8, sampleCount } } } },
          evi: { bands: { B0: { stats: { mean: 0.42, stdev: 0.04, min: 0.2, max: 0.6, sampleCount } } } },
        },
      },
    ],
  };
}

/** A configured client whose `fetch` returns a token, then NDVI statistics. */
function makeConfiguredClient(stats: unknown, failStats = false): CopernicusConfig {
  const fetchImpl = vi.fn(async (url: string | URL | Request) => {
    const target = typeof url === 'string' ? url : url.toString();
    if (target.includes('/token')) {
      return jsonResponse({ access_token: 'tok', expires_in: 600 });
    }
    return failStats ? new Response('boom', { status: 500 }) : jsonResponse(stats);
  });
  return {
    tokenUrl: 'https://example.copernicus.eu/token',
    statisticalApiUrl: 'https://example.copernicus.eu/api/v1/statistics',
    collectionId: 'sentinel-2-l2a',
    maxCloudCoverage: 30,
    resolutionMeters: 10,
    clientId: 'cid',
    clientSecret: 'sec',
    fetchImpl: fetchImpl as unknown as typeof fetch,
  };
}

describe('auditLandPlot (Sentinel/Copernicus NDVI cross-check)', () => {
  beforeEach(() => {
    clearCopernicusTokenCache();
  });

  it('confirms a claim when satellite NDVI supports it', async () => {
    const result = await auditLandPlot(makeClaim({ claimedStatus: 'planted' }), {
      config: makeConfiguredClient(ndviStatsPayload(0.6)),
    });
    expect(result.verdict).toBe('confirmed');
    expect(result.evidence.meanNdvi).toBeCloseTo(0.6, 3);
    expect(result.dataSource).toBe('copernicus-sentinel-2');
  });

  it('disputes a claim when satellite NDVI contradicts it', async () => {
    const result = await auditLandPlot(makeClaim({ claimedStatus: 'established' }), {
      config: makeConfiguredClient(ndviStatsPayload(0.35)),
    });
    expect(result.verdict).toBe('disputed');
  });

  it('returns insufficient_data when Copernicus is not configured and warns', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const unconfigured: CopernicusConfig = {
      tokenUrl: 'https://example.copernicus.eu/token',
      statisticalApiUrl: 'https://example.copernicus.eu/api/v1/statistics',
      collectionId: 'sentinel-2-l2a',
      maxCloudCoverage: 30,
      resolutionMeters: 10,
    };
    const result = await auditLandPlot(makeClaim(), { config: unconfigured });
    expect(result.verdict).toBe('insufficient_data');
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('returns insufficient_data when the API call fails and logs the error', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const result = await auditLandPlot(makeClaim(), {
      config: makeConfiguredClient(ndviStatsPayload(0.6), true),
    });
    expect(result.verdict).toBe('insufficient_data');
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('throws on an invalid claim', async () => {
    await expect(
      auditLandPlot(makeClaim({ plotId: '', plotAreaHectares: 0 }), {
        config: makeConfiguredClient(ndviStatsPayload(0.6)),
      })
    ).rejects.toThrow(/Invalid land plot audit claim/);
  });

  it('supports centroid coordinates when bounds are absent', async () => {
    const result = await auditLandPlot(
      makeClaim({ bounds: undefined, coordinates: { latitude: 7.35, longitude: 5.1 } }),
      { config: makeConfiguredClient(ndviStatsPayload(0.6)) }
    );
    expect(result.verdict).toBe('confirmed');
  });

  it('honours an explicit dateRange override in the statistics request', async () => {
    const config = makeConfiguredClient(ndviStatsPayload(0.6));
    await auditLandPlot(makeClaim(), {
      config,
      dateRange: { from: '2025-02-01T00:00:00Z', to: '2025-02-28T00:00:00Z' },
    });
    const statsCall = config.fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } };
    const [, init] = statsCall.mock.calls[statsCall.mock.calls.length - 1];
    const body = JSON.parse(init.body as string);
    expect(body.aggregation.timeRange.from).toBe('2025-02-01T00:00:00Z');
    expect(body.aggregation.timeRange.to).toBe('2025-02-28T00:00:00Z');
  });
});
