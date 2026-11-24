// Copyright 2024 Farm-credit Contributors
// Licensed under the Apache License, Version 2.0

/**
 * Copernicus NDVI API client tests (Issue #1429 / Land Plot Audits).
 *
 * `fetch` is injected via `CopernicusConfig.fetchImpl`, so these tests never
 * touch the network.
 */

import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

import {
  CopernicusApiError,
  type CopernicusConfig,
  type NdviQueryGeometry,
  boundsToGeoJsonPolygon,
  clearCopernicusTokenCache,
  fetchCopernicusAccessToken,
  fetchNdviStatistics,
  getCopernicusConfig,
  isCopernicusConfigured,
  pointBufferToGeoJsonPolygon,
} from './copernicusNdviApi';

// ── Mock fetch helpers ───────────────────────────────────────────────────────

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function textResponse(body: string, status: number): Response {
  return new Response(body, { status, headers: { 'Content-Type': 'application/json' } });
}

function makeConfig(overrides: Partial<CopernicusConfig> = {}): CopernicusConfig {
  return {
    ...getCopernicusConfig(),
    clientId: 'test-client-id',
    clientSecret: 'test-client-secret',
    fetchImpl: vi.fn() as unknown as typeof fetch,
    ...overrides,
  };
}

const STATS_PAYLOAD = {
  status: 'OK',
  data: [
    {
      interval: { from: '2025-01-01T00:00:00Z', to: '2025-01-31T00:00:00Z' },
      outputs: {
        ndvi: { bands: { B0: { stats: { mean: 0.612, stdev: 0.05, min: 0.4, max: 0.8, sampleCount: 1024 } } } },
        evi: { bands: { B0: { stats: { mean: 0.42, stdev: 0.04, min: 0.2, max: 0.6, sampleCount: 1024 } } } },
      },
    },
  ],
};

// ── Test setup ───────────────────────────────────────────────────────────────

const ENV_KEYS = [
  'COPERNICUS_CLIENT_ID',
  'COPERNICUS_CLIENT_SECRET',
  'COPERNICUS_TOKEN_URL',
  'COPERNICUS_STATISTICAL_API_URL',
  'COPERNICUS_COLLECTION_ID',
  'COPERNICUS_MAX_CLOUD_COVERAGE',
  'COPERNICUS_RESOLUTION_METERS',
];

beforeEach(() => {
  clearCopernicusTokenCache();
  for (const key of ENV_KEYS) delete process.env[key];
});

afterEach(() => {
  clearCopernicusTokenCache();
  for (const key of ENV_KEYS) delete process.env[key];
});

// ── Configuration ────────────────────────────────────────────────────────────

describe('getCopernicusConfig / isCopernicusConfigured', () => {
  it('uses sensible CDSE defaults when env is unset', () => {
    delete process.env.COPERNICUS_CLIENT_ID;
    const config = getCopernicusConfig();
    expect(config.tokenUrl).toContain('identity.dataspace.copernicus.eu');
    expect(config.statisticalApiUrl).toContain('sh.dataspace.copernicus.eu/api/v1/statistics');
    expect(config.collectionId).toBe('sentinel-2-l2a');
    expect(config.maxCloudCoverage).toBe(30);
    expect(config.resolutionMeters).toBe(10);
    expect(isCopernicusConfigured(config)).toBe(false);
  });

  it('reads credentials and overrides from env', () => {
    process.env.COPERNICUS_CLIENT_ID = 'env-id';
    process.env.COPERNICUS_CLIENT_SECRET = 'env-secret';
    process.env.COPERNICUS_COLLECTION_ID = 'sentinel-2-l1c';
    process.env.COPERNICUS_MAX_CLOUD_COVERAGE = '15';
    process.env.COPERNICUS_RESOLUTION_METERS = '20';
    const config = getCopernicusConfig();
    expect(config.clientId).toBe('env-id');
    expect(config.clientSecret).toBe('env-secret');
    expect(config.collectionId).toBe('sentinel-2-l1c');
    expect(config.maxCloudCoverage).toBe(15);
    expect(config.resolutionMeters).toBe(20);
    expect(isCopernicusConfigured(config)).toBe(true);
  });

  it('honours explicit overrides over env', () => {
    process.env.COPERNICUS_CLIENT_ID = 'env-id';
    const config = getCopernicusConfig({ clientId: 'override-id', collectionId: 'custom' });
    expect(config.clientId).toBe('override-id');
    expect(config.collectionId).toBe('custom');
  });

  it('falls back to default when numeric env is invalid', () => {
    process.env.COPERNICUS_MAX_CLOUD_COVERAGE = 'not-a-number';
    expect(getCopernicusConfig().maxCloudCoverage).toBe(30);
  });
});

// ── Geometry helpers ─────────────────────────────────────────────────────────

describe('geometry helpers', () => {
  const bounds = { north: 7.4, south: 7.3, east: 5.2, west: 5.1 };

  it('builds a counter-clockwise GeoJSON polygon from bounds', () => {
    const poly = boundsToGeoJsonPolygon(bounds);
    expect(poly.type).toBe('Polygon');
    expect(poly.coordinates).toHaveLength(1);
    const ring = poly.coordinates[0];
    expect(ring).toHaveLength(5); // 4 corners + closing point
    // First vertex is the SW corner [west, south] in lon/lat order.
    expect(ring[0]).toEqual([5.1, 7.3]);
    // Ring is closed.
    expect(ring[0]).toEqual(ring[4]);
  });

  it('rejects inverted bounds', () => {
    expect(() => boundsToGeoJsonPolygon({ north: 1, south: 2, east: 3, west: 4 })).toThrow(
      CopernicusApiError
    );
    expect(() => boundsToGeoJsonPolygon({ north: 2, south: 1, east: 1, west: 2 })).toThrow(
      CopernicusApiError
    );
  });

  it('builds a polygon buffer around a point', () => {
    const poly = pointBufferToGeoJsonPolygon(7.35, 5.1, 100) as NdviQueryGeometry;
    expect(poly.type).toBe('Polygon');
    expect(poly.coordinates[0]).toHaveLength(5);
    // The buffer spans a small lat/lon range around the point.
    const ring = poly.coordinates[0];
    const lats = ring.map((p) => p[1]);
    const lons = ring.map((p) => p[0]);
    expect(Math.min(...lats)).toBeLessThan(7.35);
    expect(Math.max(...lats)).toBeGreaterThan(7.35);
    expect(Math.min(...lons)).toBeLessThan(5.1);
    expect(Math.max(...lons)).toBeGreaterThan(5.1);
  });
});

// ── Token acquisition ─────────────────────────────────────────────────────────

describe('fetchCopernicusAccessToken', () => {
  it('throws when not configured', async () => {
    const config = makeConfig({ clientId: undefined, clientSecret: undefined });
    await expect(fetchCopernicusAccessToken(config)).rejects.toThrow(CopernicusApiError);
  });

  it('acquires and caches the access token', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: 'abc', expires_in: 600 }));
    const config = makeConfig({ fetchImpl: fetchImpl as unknown as typeof fetch });

    const token1 = await fetchCopernicusAccessToken(config);
    const token2 = await fetchCopernicusAccessToken(config);

    expect(token1).toBe('abc');
    expect(token2).toBe('abc'); // served from cache
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    // Token request uses the client-credentials grant against the token URL.
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(config.tokenUrl);
    expect(init.method).toBe('POST');
    expect(String(init.body)).toContain('grant_type=client_credentials');
    expect(String(init.body)).toContain('client_id=test-client-id');
    expect(String(init.body)).toContain('client_secret=test-client-secret');
  });

  it('throws a typed error with status on HTTP failure', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(textResponse('unauthorized', 401));
    const config = makeConfig({ fetchImpl: fetchImpl as unknown as typeof fetch });

    await expect(fetchCopernicusAccessToken(config)).rejects.toMatchObject({
      name: 'CopernicusApiError',
      status: 401,
    });
  });

  it('throws when the response omits access_token', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(jsonResponse({ foo: 'bar' }));
    const config = makeConfig({ fetchImpl: fetchImpl as unknown as typeof fetch });

    await expect(fetchCopernicusAccessToken(config)).rejects.toThrow(CopernicusApiError);
  });

  it('throws on network errors', async () => {
    const fetchImpl = vi.fn().mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const config = makeConfig({ fetchImpl: fetchImpl as unknown as typeof fetch });

    await expect(fetchCopernicusAccessToken(config)).rejects.toThrow(/token endpoint/);
  });
});

// ── NDVI statistics query ────────────────────────────────────────────────────

describe('fetchNdviStatistics', () => {
  const geometry: NdviQueryGeometry = boundsToGeoJsonPolygon({
    north: 7.4,
    south: 7.3,
    east: 5.2,
    west: 5.1,
  });
  const dateRange = { from: '2025-01-01', to: '2025-01-31' };

  function makeTwoCallFetch(token: string, statsResponse: Response) {
    return vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: token, expires_in: 600 }))
      .mockResolvedValueOnce(statsResponse);
  }

  it('fetches and parses NDVI/EVI statistics', async () => {
    const fetchImpl = makeTwoCallFetch('tok', jsonResponse(STATS_PAYLOAD));
    const config = makeConfig({ fetchImpl: fetchImpl as unknown as typeof fetch });

    const stats = await fetchNdviStatistics(geometry, dateRange, config);

    expect(stats.meanNdvi).toBeCloseTo(0.612, 3);
    expect(stats.meanEvi).toBeCloseTo(0.42, 3);
    expect(stats.stdevNdvi).toBeCloseTo(0.05, 3);
    expect(stats.minNdvi).toBeCloseTo(0.4, 3);
    expect(stats.maxNdvi).toBeCloseTo(0.8, 3);
    expect(stats.sampleCount).toBe(1024);
    expect(stats.interval).toEqual({ from: '2025-01-01T00:00:00Z', to: '2025-01-31T00:00:00Z' });
    expect(stats.source).toBe('copernicus-sentinel-2');
    expect(stats.collectionId).toBe('sentinel-2-l2a');
  });

  it('sends a bearer-authenticated Statistical API request with the right shape', async () => {
    const fetchImpl = makeTwoCallFetch('tok-123', jsonResponse(STATS_PAYLOAD));
    const config = makeConfig({ fetchImpl: fetchImpl as unknown as typeof fetch });

    await fetchNdviStatistics(geometry, dateRange, config);

    // Second call is the statistics request.
    const [url, init] = fetchImpl.mock.calls[1];
    expect(url).toBe(config.statisticalApiUrl);
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer tok-123');
    expect(init.headers['Content-Type']).toBe('application/json');

    const body = JSON.parse(init.body as string);
    expect(body.input.bounds.geometry.type).toBe('Polygon');
    expect(body.input.bounds.properties.crs).toContain('4326');
    expect(body.input.data[0].type).toBe('sentinel-2-l2a');
    expect(body.input.data[0].dataFilter.timeRange.from).toBe('2025-01-01T00:00:00Z');
    expect(body.input.data[0].dataFilter.timeRange.to).toBe('2025-01-31T00:00:00Z');
    expect(body.input.data[0].dataFilter.maxCloudCoverage).toBe(30);
    expect(body.aggregation.resolution).toEqual({ unit: 'm', value: 10 });
    expect(body.aggregation.evalscript).toContain('B04');
    expect(body.aggregation.evalscript).toContain('B08');
  });

  it('returns sampleCount 0 when no cloud-free data exists', async () => {
    const fetchImpl = makeTwoCallFetch('tok', jsonResponse({ status: 'OK', data: [] }));
    const config = makeConfig({ fetchImpl: fetchImpl as unknown as typeof fetch });

    const stats = await fetchNdviStatistics(geometry, dateRange, config);
    expect(stats.sampleCount).toBe(0);
    expect(stats.meanNdvi).toBe(0);
    expect(stats.interval).toBeNull();
  });

  it('clamps NDVI into [-1, 1] and nulls invalid values', async () => {
    const payload = {
      status: 'OK',
      data: [
        {
          interval: { from: '2025-01-01T00:00:00Z', to: '2025-01-31T00:00:00Z' },
          outputs: {
            ndvi: {
              bands: { B0: { stats: { mean: 1.4, stdev: NaN, min: -2, max: 2, sampleCount: 10 } } },
            },
            // No EVI output.
          },
        },
      ],
    };
    const fetchImpl = makeTwoCallFetch('tok', jsonResponse(payload));
    const config = makeConfig({ fetchImpl: fetchImpl as unknown as typeof fetch });

    const stats = await fetchNdviStatistics(geometry, dateRange, config);
    expect(stats.meanNdvi).toBe(1);
    expect(stats.minNdvi).toBe(-1);
    expect(stats.maxNdvi).toBe(1);
    expect(stats.stdevNdvi).toBeNull();
    expect(stats.meanEvi).toBeNull();
  });

  it('throws a typed error with status on HTTP failure', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: 'tok', expires_in: 600 }))
      .mockResolvedValueOnce(textResponse('{"error":"bad"}', 422));
    const config = makeConfig({ fetchImpl: fetchImpl as unknown as typeof fetch });

    await expect(fetchNdviStatistics(geometry, dateRange, config)).rejects.toMatchObject({
      name: 'CopernicusApiError',
      status: 422,
    });
  });

  it('throws when not configured', async () => {
    const config = makeConfig({ clientId: undefined, clientSecret: undefined });
    await expect(fetchNdviStatistics(geometry, dateRange, config)).rejects.toThrow(
      CopernicusApiError
    );
  });

  it('throws when no fetch implementation is available', async () => {
    const config = makeConfig({ fetchImpl: undefined });
    // Force globalThis.fetch to be absent for this assertion.
    const originalFetch = globalThis.fetch;
    (globalThis as unknown as { fetch: typeof fetch | undefined }).fetch = undefined;
    try {
      await expect(fetchCopernicusAccessToken(config)).rejects.toThrow(/fetch implementation/);
    } finally {
      (globalThis as unknown as { fetch: typeof fetch | undefined }).fetch = originalFetch;
    }
  });
});
