/**
 * Route tests for GET/POST /api/v2/carbon-accounting — Issue #1432
 */

import { describe, expect, it } from 'vitest';
import { GET, POST } from './route';

const URL_BASE = 'http://localhost:3000/api/v2/carbon-accounting';

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

describe('GET /api/v2/carbon-accounting', () => {
  it('returns the emission-factor catalogue by default', async () => {
    const response = await GET(getRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.standard).toBe('GHG Protocol Corporate Standard');
    expect(body.version).toBe('2.0');
    expect(body.factors.scope1.stationary['natural-gas'].kgCo2ePerUnit).toBe(5.31);
    expect(body.factors.scope2.gridRegions['us-average']).toBe(0.417);
    expect(body.scopes['3']).toContain('categories 4, 5, 6 and 7');
  });

  it('stamps v2 version headers', async () => {
    const response = await GET(getRequest());
    expect(response.headers.get('X-API-Version')).toBe('v2');
    expect(response.headers.get('Cache-Control')).toContain('no-store');
  });

  it('computes an inventory from scalar query params', async () => {
    const response = await GET(
      getRequest('?scope2.electricityKwh=10000&scope2.gridRegion=eu&offsets.treesPlanted=50')
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.grossEmissions.kg).toBeCloseTo(2300, 1); // 10000 × 0.23
    expect(body.offsets.treeSequestrationTonnes).toBeCloseTo(2.4, 3);
    expect(body.standard).toBe('GHG Protocol Corporate Standard');
  });

  it('returns 400 for malformed query values', async () => {
    const response = await GET(getRequest('?scope2.renewablePercentage=150'));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe('Invalid carbon accounting request');
    expect(body.details.join(' ')).toContain('renewablePercentage');
  });
});

describe('POST /api/v2/carbon-accounting', () => {
  it('computes a full multi-scope inventory', async () => {
    const response = await POST(
      postRequest({
        reportingPeriod: { from: '2025-01-01', to: '2025-12-31' },
        organization: { name: 'Acme Reforestation', employees: 10 },
        scope1: {
          stationary: [{ fuel: 'natural-gas', quantity: 100 }],
          mobile: [{ fuel: 'gasoline', quantity: 10 }],
          fugitive: [{ refrigerant: 'R-410A', quantityKg: 1 }],
        },
        scope2: { electricityKwh: 10000, renewablePercentage: 25 },
        scope3: {
          freight: [{ mode: 'truck', tonnes: 10, distanceKm: 100 }],
          waste: [{ method: 'landfill', tonnes: 1 }],
          businessTravel: { shortHaulFlights: 2 },
          commuting: [{ mode: 'car', distanceKm: 1000 }],
        },
        offsets: { creditsRetiredTonnes: 5, treesPlanted: 100 },
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.period).toEqual({ from: '2025-01-01', to: '2025-12-31' });

    // Scope 1: 531 (gas) + 88.87 (gasoline) + 1924 (R-410A)
    expect(body.scope1.totalKg).toBeCloseTo(2543.87, 1);
    // Scope 2: dual-reported
    expect(body.scope2.locationBasedKg).toBeCloseTo(4170, 1);
    expect(body.scope2.marketBasedKg).toBeCloseTo(3127.5, 1);
    // Scope 3: 104 (freight) + 580 (waste) + 510 (flights) + 171 (commute)
    expect(body.scope3.totalKg).toBeCloseTo(1365, 1);
    expect(body.scope3.categories.map((c: { category: number }) => c.category)).toEqual([
      4, 5, 6, 7,
    ]);

    expect(body.grossEmissions.kg).toBeCloseTo(2543.87 + 4170 + 1365, 0);
    expect(body.offsets.totalTonnes).toBeCloseTo(9.8, 3); // 5 credits + 4.8 t trees
    expect(body.intensity.perEmployeeTonnes).toBeCloseTo(0.808, 3);
  });

  it('accepts an offsets-only body', async () => {
    const response = await POST(postRequest({ offsets: { creditsRetiredTonnes: 3 } }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.grossEmissions.kg).toBe(0);
    expect(body.offsets.creditsRetiredTonnes).toBe(3);
    expect(body.netEmissions.tonnes).toBe(-3);
  });

  it('returns 400 for an empty body', async () => {
    const response = await POST(postRequest({}));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe('Invalid carbon accounting request');
    expect(body.details.join(' ')).toContain('scope1');
  });

  it('returns 400 for negative quantities', async () => {
    const response = await POST(
      postRequest({ scope1: { stationary: [{ fuel: 'diesel', quantity: -1 }] } })
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.details.join(' ')).toContain('quantity');
  });

  it('returns 400 for an inverted reporting period', async () => {
    const response = await POST(
      postRequest({
        offsets: { creditsRetiredTonnes: 1 },
        reportingPeriod: { from: '2025-06-01', to: '2025-01-01' },
      })
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.details.join(' ')).toContain('reportingPeriod.to');
  });

  it('returns 400 for an invalid JSON body', async () => {
    const response = await POST(postRequest('{not json', true));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe('Invalid JSON body');
  });
});
