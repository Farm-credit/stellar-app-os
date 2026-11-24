import { describe, expect, it } from 'vitest';
import { GET, POST } from '@/app/api/v2/farmers/income-prediction/route';

const URL_BASE = 'http://localhost:3000/api/v2/farmers/income-prediction';

describe('/api/v2/farmers/income-prediction (#1421)', () => {
  it('GET returns a prediction for valid query parameters', async () => {
    const res = GET(
      new Request(
        `${URL_BASE}?landSizeHectares=8&region=africa&practiceType=reforestation&projectYears=6`
      )
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(res.headers.get('X-API-Version')).toBe('v2');
    expect(data.prediction.input).toEqual({
      landSizeHectares: 8,
      region: 'africa',
      practiceType: 'reforestation',
      projectYears: 6,
    });
    expect(data.prediction.yearly).toHaveLength(6);
    expect(data.prediction.totals.income.expected).toBeGreaterThan(0);
  });

  it('GET rejects missing parameters with details', async () => {
    const res = GET(new Request(`${URL_BASE}?region=africa`));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.details).toContain('landSizeHectares is required');
    expect(data.details).toContain('practiceType is required');
  });

  it('POST returns a prediction for a JSON body', async () => {
    const res = await POST(
      new Request(URL_BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          landSizeHectares: 3,
          region: 'southeast-asia',
          practiceType: 'mangrove-restoration',
        }),
      })
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.prediction.prices.basis).toBe('region-and-practice');
    expect(data.prediction.yearly).toHaveLength(10);
  });

  it('POST rejects malformed JSON', async () => {
    const res = await POST(new Request(URL_BASE, { method: 'POST', body: '{not json' }));
    expect(res.status).toBe(400);
  });
});
