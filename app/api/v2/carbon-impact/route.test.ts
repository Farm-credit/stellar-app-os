import { describe, expect, it } from 'vitest';
import { POST } from './route';

const url = 'http://localhost:3000/api/v2/carbon-impact';

function request(body: unknown): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/v2/carbon-impact', () => {
  it('calculates energy, vehicle, intensity, and credit recommendations', async () => {
    const response = await POST(
      request({
        employees: 10,
        energy: { electricityKwh: 10_000, naturalGasTherms: 100, renewablePercentage: 25 },
        vehicles: { gasolineLiters: 1_000, dieselLiters: 500, electricKwh: 200 },
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.emissions.energyKg).toBeCloseTo(3_658.5, 1);
    expect(body.emissions.vehicleKg).toBeCloseTo(3_733.4, 1);
    expect(body.emissions.totalTonnes).toBeCloseTo(7.392, 3);
    expect(body.emissions.perEmployeeTonnes).toBeCloseTo(0.739, 2);
    expect(body.recommendations.creditsNeeded).toBe(8);
    expect(body.recommendations.renewableEnergySavingsKg).toBeCloseTo(1_042.5, 1);
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
    const response = await POST(new Request(url, { method: 'POST', body: '{not-json' }));
    expect(response.status).toBe(400);
  });
});
