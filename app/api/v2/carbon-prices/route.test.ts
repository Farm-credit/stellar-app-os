/**
 * Route tests for /api/v2/carbon-prices (-/history) — Issue #1388
 */

import { describe, expect, it } from 'vitest';
import { GET, POST } from './route';
import { GET as GET_HISTORY } from './history/route';
import { CARBON_PRICE_CATALOG } from '@/lib/api/carbon-prices';

const URL_BASE = 'http://localhost:3000/api/v2/carbon-prices';

function getRequest(query = ''): Request {
  return new Request(`${URL_BASE}${query}`);
}

function postRequest(body: unknown, raw = false): Request {
  return new Request(URL_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: raw ? (body as string) : JSON.stringify(body),
  });
}

describe('GET /api/v2/carbon-prices', () => {
  it('returns every listed series and stamps the v2 headers', async () => {
    const response = await GET(getRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('X-API-Version')).toBe('v2');
    expect(response.headers.get('Cache-Control')).toContain('public');
    expect(body.count).toBe(CARBON_PRICE_CATALOG.length);
    expect(body.currency).toBe('USD');
    expect(body.source).toBe('catalog');
    expect(body.quotes).toHaveLength(CARBON_PRICE_CATALOG.length);
    expect(body.quotes[0].pricePerTon).toBeGreaterThan(0);
  });

  it('filters by project type and certification standard', async () => {
    const response = await GET(getRequest('?types=Reforestation&standards=Gold%20Standard'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.count).toBe(1);
    expect(body.quotes[0].projectType).toBe('Reforestation');
    expect(body.quotes[0].standard).toBe('Gold Standard');
    expect(body.filters.types).toEqual(['Reforestation']);
  });

  it('filters by region and returns matching aggregates', async () => {
    const response = await GET(getRequest('?regions=africa'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.quotes.every((quote: { region: string }) => quote.region === 'africa')).toBe(true);
    expect(body.aggregates.byRegion).toEqual([
      expect.objectContaining({ key: 'africa', quoteCount: 2 }),
    ]);
    expect(body.aggregates.byType).toHaveLength(2);
  });

  it('returns 400 for an unknown filter value', async () => {
    const response = await GET(getRequest('?types=Plastic%20Credits'));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe('Invalid carbon price request');
    expect(body.details.join(' ')).toContain('Unknown types value');
  });

  it('returns 400 for an out-of-range limit', async () => {
    const response = await GET(getRequest('?limit=9999'));
    expect(response.status).toBe(400);
  });
});

describe('POST /api/v2/carbon-prices', () => {
  it('returns 400 for an invalid JSON body', async () => {
    const response = await POST(postRequest('{not json', true));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe('Invalid JSON body');
  });

  it('returns 400 when the body fails validation', async () => {
    const response = await POST(postRequest({ regions: ['mars'] }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.details.join(' ')).toContain('Unknown regions value');
  });

  it('returns the filtered snapshot from a JSON body', async () => {
    const response = await POST(
      postRequest({ types: ['Mangrove Restoration'], limit: 1 })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.count).toBe(1);
    expect(body.filters.limit).toBe(1);
    expect(body.quotes[0].projectType).toBe('Mangrove Restoration');
    expect(body.aggregates.averagePricePerTon).toBe(body.quotes[0].pricePerTon);
  });
});

describe('GET /api/v2/carbon-prices/history', () => {
  function historyRequest(query: string): Request {
    return new Request(`${URL_BASE}/history${query}`);
  }

  it('returns 400 when assetCode is missing', async () => {
    const response = await GET_HISTORY(historyRequest(''));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.details.join(' ')).toContain('assetCode');
  });

  it('returns 404 for an unlisted asset', async () => {
    const response = await GET_HISTORY(historyRequest('?assetCode=CARBON-NOPE-2026'));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toContain('CARBON-NOPE-2026');
  });

  it('returns a daily series with stats', async () => {
    const assetCode = CARBON_PRICE_CATALOG[0].assetCode;
    const response = await GET_HISTORY(historyRequest(`?assetCode=${assetCode}`));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('X-API-Version')).toBe('v2');
    expect(body.assetCode).toBe(assetCode);
    expect(body.interval).toBe('day');
    expect(body.points).toHaveLength(90);
    expect(body.stats.points).toBe(90);
    expect(body.stats.minPrice).toBeLessThanOrEqual(body.stats.maxPrice);
    expect(body.stats.averagePrice).toBeGreaterThan(0);
  });

  it('aggregates into weekly buckets when asked', async () => {
    const assetCode = CARBON_PRICE_CATALOG[0].assetCode;
    const daily = await (await GET_HISTORY(historyRequest(`?assetCode=${assetCode}`))).json();
    const weekly = await (
      await GET_HISTORY(historyRequest(`?assetCode=${assetCode}&interval=week`))
    ).json();

    expect(weekly.interval).toBe('week');
    expect(weekly.points.length).toBeLessThan(daily.points.length);
    expect(weekly.points[0].at).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('returns 400 for an inverted date range', async () => {
    const assetCode = CARBON_PRICE_CATALOG[0].assetCode;
    const response = await GET_HISTORY(
      historyRequest(`?assetCode=${assetCode}&from=2026-09-10&to=2026-09-01`)
    );

    expect(response.status).toBe(400);
  });
});
