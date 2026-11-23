import { describe, expect, it } from 'vitest';
import { POST } from './route';

const url = 'http://localhost:3000/api/carbon-impact';

function request(body: unknown): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/carbon-impact', () => {
  it('returns emissions and full-offset credit recommendations', async () => {
    const response = await POST(
      request({
        employees: 10,
        energy: { electricityKwh: 10_000, naturalGasTherms: 100, renewablePercentage: 25 },
        vehicles: { gasolineLiters: 1_000, dieselLiters: 500, electricKwh: 200 },
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.emissions.totalTonnes).toBeCloseTo(7.392, 3);
    expect(body.recommendations.creditsNeeded).toBe(8);
    expect(body.recommendations.creditsUnit).toBe('metric_tonne_co2e');
  });

  it('rejects invalid emissions input', async () => {
    const response = await POST(
      request({
        employees: 0,
        energy: { electricityKwh: -1, renewablePercentage: 110 },
        vehicles: {},
      })
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe('Invalid carbon impact request');
  });

  it('returns 400 for malformed JSON', async () => {
    const response = await POST(new Request(url, { method: 'POST', body: '{not-json' }));
    expect(response.status).toBe(400);
  });
});
