import { beforeEach, describe, expect, it, vi } from 'vitest';

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
const { fetchClimateNormals } = vi.hoisted(() => ({ fetchClimateNormals: vi.fn() }));

vi.mock('@/lib/db/client', () => ({ getPool: () => ({ query }) }));
vi.mock('@/lib/climate/climateClient', () => ({ fetchClimateNormals }));
vi.mock('@/lib/logger', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { GET } from './route';

function request(query: string): Request {
  return new Request(`http://localhost/api/planting/growth-projection${query}`);
}

const TEAK_ROW = {
  slug: 'teak',
  common_name: 'Teak',
  biome: 'Tropical dry forest',
  co2_kg_per_year: '22.00',
  maturity_years: 20,
};

describe('GET /api/planting/growth-projection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a climate-neutral projection for speciesSlug with no coordinates', async () => {
    query.mockResolvedValueOnce({ rows: [TEAK_ROW] });

    const response = await GET(request('?speciesSlug=teak'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.species).toMatchObject({ slug: 'teak', co2KgPerYearAtMaturity: 22 });
    expect(body.climate).toBeNull();
    expect(body.horizonYears).toBe(20);
    expect(body.curve).toHaveLength(21);
    expect(body.curve[0]).toMatchObject({ year: 0, annualCo2RateKg: 0 });
    expect(fetchClimateNormals).not.toHaveBeenCalled();
  });

  it('applies climate adjustment when lat/lon are provided', async () => {
    query.mockResolvedValueOnce({ rows: [TEAK_ROW] });
    fetchClimateNormals.mockResolvedValueOnce({
      status: 'ok',
      normals: {
        avgAnnualRainfallMm: 1250,
        avgAnnualTemperatureC: 27,
        monthlyRainfallMm: Array(12).fill(104),
        monthlyTemperatureC: Array(12).fill(27),
        source: 'NASA POWER',
      },
    });

    const response = await GET(request('?speciesSlug=teak&lat=9.05&lon=7.49'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(fetchClimateNormals).toHaveBeenCalledWith(9.05, 7.49);
    expect(body.climate).not.toBeNull();
    expect(body.climateSource).toBe('NASA POWER');
  });

  it('falls back to a climate-neutral projection when the climate API fails', async () => {
    query.mockResolvedValueOnce({ rows: [TEAK_ROW] });
    fetchClimateNormals.mockResolvedValueOnce({ status: 'error', error: 'timeout' });

    const response = await GET(request('?speciesSlug=teak&lat=9.05&lon=7.49'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.climate).toBeNull();
    expect(body.curve).toBeDefined();
  });

  it('resolves species and location from treeRef, ignoring other params', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ species_slug: 'teak', lat: '9.05', lng: '7.49' }] })
      .mockResolvedValueOnce({ rows: [TEAK_ROW] });
    fetchClimateNormals.mockResolvedValueOnce({
      status: 'ok',
      normals: {
        avgAnnualRainfallMm: 1250,
        avgAnnualTemperatureC: 27,
        monthlyRainfallMm: Array(12).fill(104),
        monthlyTemperatureC: Array(12).fill(27),
        source: 'NASA POWER',
      },
    });

    const response = await GET(request('?treeRef=HRV-2024-0001'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.species.slug).toBe('teak');
    expect(fetchClimateNormals).toHaveBeenCalledWith(9.05, 7.49);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('FROM trees'), ['HRV-2024-0001']);
  });

  it('returns 404 when treeRef does not match any tree', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const response = await GET(request('?treeRef=DOES-NOT-EXIST'));

    expect(response.status).toBe(404);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('returns 404 when speciesSlug does not match any species', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const response = await GET(request('?speciesSlug=not-a-real-species'));

    expect(response.status).toBe(404);
  });

  it('returns 400 when neither speciesSlug nor treeRef is provided', async () => {
    const response = await GET(request(''));

    expect(response.status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });

  it('returns 400 for a non-positive years override', async () => {
    const response = await GET(request('?speciesSlug=teak&years=0'));

    expect(response.status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });

  it('returns 500 without an unhandled rejection when the database query fails', async () => {
    query.mockRejectedValueOnce(new Error('connection terminated'));

    const response = await GET(request('?speciesSlug=teak'));

    expect(response.status).toBe(500);
  });
});
