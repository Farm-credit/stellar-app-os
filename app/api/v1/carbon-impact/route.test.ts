/**
 * Route tests for /api/v1/carbon-impact — Issue #1333
 */

import { describe, expect, it } from 'vitest';
import { POST } from './route';

const url = 'http://localhost:3000/api/v1/carbon-impact';

function request(body: unknown, raw = false): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: raw ? (body as string) : JSON.stringify(body),
  });
}

describe('POST /api/v1/carbon-impact', () => {
  it('calculates emissions and credit recommendations with v1 headers', async () => {
    const response = await POST(
      request({
        employees: 10,
        energy: { electricityKwh: 10_000, naturalGasTherms: 100, renewablePercentage: 25 },
        vehicles: { gasolineLiters: 1_000, dieselLiters: 500, electricKwh: 200 },
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('X-API-Version')).toBe('v1');
    expect(response.headers.get('Cache-Control')).toContain('no-store');
    expect(body.emissions.energyKg).toBeCloseTo(3_658.5, 1);
    expect(body.emissions.vehicleKg).toBeCloseTo(3_733.4, 1);
    expect(body.emissions.totalTonnes).toBeCloseTo(7.392, 3);
    expect(body.emissions.perEmployeeTonnes).toBeCloseTo(0.739, 2);
    expect(body.recommendations.creditsNeeded).toBe(8);
    expect(body.recommendations.creditsUnit).toBe('metric_tonne_co2e');
    expect(body.recommendations.renewableEnergySavingsKg).toBeCloseTo(1_042.5, 1);
    expect(body.recommendations.notes.length).toBeGreaterThan(0);
    expect(body.factors.electricityKwh).toBeGreaterThan(0);
  });

  it('applies documented defaults for omitted inner fields', async () => {
    const response = await POST(request({ employees: 5, energy: {}, vehicles: {} }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.emissions.totalKg).toBe(0);
    expect(body.recommendations.creditsNeeded).toBe(0);
    expect(body.emissions.perEmployeeKg).toBe(0);
  });

  it('rejects missing, negative, and out-of-range inputs', async () => {
    const response = await POST(
      request({
        employees: 0,
        energy: { electricityKwh: -1, renewablePercentage: 110 },
        vehicles: {},
      })
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('Invalid carbon impact request');
    expect(body.details.map((detail: { path: string }) => detail.path)).toEqual(
      expect.arrayContaining(['employees', 'energy.electricityKwh', 'energy.renewablePercentage'])
    );
  });

  it('returns 400 for malformed JSON', async () => {
    const response = await POST(request('{not-json', true));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe('Invalid JSON body');
  });
});
