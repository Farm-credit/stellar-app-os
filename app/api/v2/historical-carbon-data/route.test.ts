import { describe, expect, it } from 'vitest';
import { GET } from './route';
import {
  getHistoricalCarbonData,
  parseHistoricalCarbonQuery,
} from '@/lib/api/historical-carbon-data';

const BASE = 'http://localhost:3000/api/v2/historical-carbon-data';

function request(query = ''): Request {
  return new Request(`${BASE}${query}`);
}

describe('historical carbon data service', () => {
  it('rejects invalid intervals and unknown dimensions', () => {
    const result = parseHistoricalCarbonQuery(
      new URLSearchParams('interval=year&regions=atlantis')
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(' ')).toContain('interval');
  });

  it('rejects ranges longer than the supported retention window', () => {
    const result = parseHistoricalCarbonQuery(new URLSearchParams('from=2020-01-01&to=2026-01-01'));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(' ')).toContain('730');
  });

  it('returns market, project, regional, and project-type trends', () => {
    const result = getHistoricalCarbonData(
      { from: '2026-01-01', to: '2026-03-31', interval: 'month' },
      new Date('2026-03-31T12:00:00Z')
    );

    expect(result.priceHistory).toHaveLength(3);
    expect(result.priceHistory.every((point) => point.averagePricePerTon > 0)).toBe(true);
    expect(result.projectPerformance.length).toBeGreaterThan(1);
    expect(result.buyerTrends.some((trend) => trend.dimension === 'region')).toBe(true);
    expect(result.buyerTrends.some((trend) => trend.dimension === 'projectType')).toBe(true);
    expect(result.dataQuality.buyerActivityMetric).toBe('listed_volume_tonnes');
  });

  it('applies region and project type filters', () => {
    const result = getHistoricalCarbonData({
      from: '2026-01-01',
      to: '2026-01-31',
      interval: 'day',
      regions: ['africa'],
      projectTypes: ['Reforestation'],
    });

    expect(result.projectPerformance).toHaveLength(1);
    expect(result.projectPerformance[0].region).toBe('africa');
    expect(result.projectPerformance[0].projectType).toBe('Reforestation');
    expect(
      result.buyerTrends.every((trend) => trend.key === 'africa' || trend.key === 'Reforestation')
    ).toBe(true);
  });
});

describe('GET /api/v2/historical-carbon-data', () => {
  it('returns a versioned, cacheable response', async () => {
    const response = await GET(request('?from=2026-01-01&to=2026-03-31&interval=month'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('X-API-Version')).toBe('v2');
    expect(response.headers.get('Cache-Control')).toContain('public');
    expect(body.priceHistory).toHaveLength(3);
    expect(body.projectPerformance.length).toBeGreaterThan(0);
  });

  it('returns structured validation errors', async () => {
    const response = await GET(request('?from=2026-04-01&to=2026-03-01'));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe('Invalid historical carbon data request');
    expect(body.details.join(' ')).toContain('from must not be after to');
  });
});
