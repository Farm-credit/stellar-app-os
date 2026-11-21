import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { fetchClimateNormals } from '../climateClient';

const NASA_POWER_FIXTURE = {
  properties: {
    parameter: {
      T2M: {
        JAN: 25.1,
        FEB: 26.0,
        MAR: 27.2,
        APR: 28.0,
        MAY: 27.5,
        JUN: 26.8,
        JUL: 25.9,
        AUG: 25.7,
        SEP: 26.2,
        OCT: 26.9,
        NOV: 26.1,
        DEC: 25.3,
        ANN: 26.4,
      },
      PRECTOTCORR: {
        JAN: 1.2,
        FEB: 1.5,
        MAR: 3.0,
        APR: 5.1,
        MAY: 6.8,
        JUN: 7.2,
        JUL: 6.9,
        AUG: 6.5,
        SEP: 5.8,
        OCT: 4.0,
        NOV: 2.1,
        DEC: 1.0,
        ANN: 4.26,
      },
    },
  },
};

describe('fetchClimateNormals', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    global.fetch = originalFetch;
    delete process.env.CLIMATE_API_BASE_URL;
    delete process.env.CLIMATE_API_TIMEOUT_MS;
    delete process.env.CLIMATE_API_KEY;
  });

  it('parses monthly and annual normals from a successful response', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(NASA_POWER_FIXTURE),
    } as Response);

    const result = await fetchClimateNormals(9.05, 7.49);

    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.normals.avgAnnualTemperatureC).toBe(26.4);
      expect(result.normals.monthlyTemperatureC).toHaveLength(12);
      expect(result.normals.monthlyRainfallMm).toHaveLength(12);
      expect(result.normals.monthlyTemperatureC[0]).toBe(25.1);
      // JAN: 1.2mm/day * 31 days = 37.2mm
      expect(result.normals.monthlyRainfallMm[0]).toBeCloseTo(37.2, 5);
      expect(result.normals.avgAnnualRainfallMm).toBeGreaterThan(0);
      expect(result.normals.source).toBe('NASA POWER');
    }
  });

  it('sends lat/lon and default params to the configured base URL', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(NASA_POWER_FIXTURE),
    } as Response);

    await fetchClimateNormals(9.05, 7.49);

    const calledUrl = new URL(vi.mocked(fetch).mock.calls[0][0] as string);
    expect(calledUrl.origin + calledUrl.pathname).toBe(
      'https://power.larc.nasa.gov/api/temporal/climatology/point'
    );
    expect(calledUrl.searchParams.get('latitude')).toBe('9.05');
    expect(calledUrl.searchParams.get('longitude')).toBe('7.49');
    expect(calledUrl.searchParams.get('parameters')).toBe('T2M,PRECTOTCORR');
  });

  it('returns a status: error result (not a throw) on a non-OK HTTP response', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 503 } as Response);

    const result = await fetchClimateNormals(9.05, 7.49);

    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.error).toContain('503');
    }
  });

  it('returns a status: error result when fetch rejects (network failure)', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('getaddrinfo ENOTFOUND'));

    const result = await fetchClimateNormals(9.05, 7.49);

    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.error).toContain('ENOTFOUND');
    }
  });

  it('returns a status: error result when the response is missing expected fields', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ properties: { parameter: {} } }),
    } as Response);

    const result = await fetchClimateNormals(9.05, 7.49);

    expect(result.status).toBe('error');
  });

  it('reports a timeout as a status: error result, not an unhandled rejection', async () => {
    vi.mocked(fetch).mockImplementation(
      (_url: unknown, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const abortError = new Error('This operation was aborted');
            abortError.name = 'AbortError';
            reject(abortError);
          });
        })
    );
    process.env.CLIMATE_API_TIMEOUT_MS = '10';

    const result = await fetchClimateNormals(9.05, 7.49);

    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.error).toContain('timed out');
    }
  });

  it('respects CLIMATE_API_BASE_URL and CLIMATE_API_KEY overrides', async () => {
    process.env.CLIMATE_API_BASE_URL = 'https://example.test/climatology';
    process.env.CLIMATE_API_KEY = 'test-key-123';
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(NASA_POWER_FIXTURE),
    } as Response);

    await fetchClimateNormals(1, 2);

    const [calledUrl, init] = vi.mocked(fetch).mock.calls[0];
    expect((calledUrl as string).startsWith('https://example.test/climatology')).toBe(true);
    expect((init as RequestInit).headers).toEqual({ Authorization: 'Bearer test-key-123' });
  });
});
