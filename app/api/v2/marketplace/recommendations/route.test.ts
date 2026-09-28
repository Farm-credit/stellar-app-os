import { describe, it, expect } from 'vitest';
import { POST } from '@/app/api/v2/marketplace/recommendations/route';

function post(body: unknown) {
  return POST(
    new Request('http://localhost:3000/api/v2/marketplace/recommendations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    })
  );
}

describe('POST /api/v2/marketplace/recommendations (#1430)', () => {
  it('returns ranked recommendations for a valid profile', async () => {
    const res = await post({
      industry: 'agriculture_food',
      companySize: 'sme',
      budgetUsd: 5000,
      coBenefitPreferences: ['soil', 'food_security'],
      pastPurchases: [{ projectId: 'proj-001', tonnes: 20 }],
    });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.recommendations[0].project.id).toBe('proj-005');
    expect(data.recommendations[0].reasons.length).toBeGreaterThan(0);
    expect(data.excluded).toContainEqual({ projectId: 'proj-003', reason: 'out_of_stock' });
  });

  it('honours and clamps the limit', async () => {
    const res = await post({
      industry: 'technology',
      companySize: 'startup',
      budgetUsd: 1000,
      limit: 2,
    });
    const data = await res.json();
    expect(data.recommendations).toHaveLength(2);
  });

  it('rejects an invalid profile with details', async () => {
    const res = await post({ industry: 'mining', companySize: 'huge', budgetUsd: -1 });
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.details).toHaveLength(3);
  });

  it('rejects a non-JSON body', async () => {
    const res = await post('not json');
    expect(res.status).toBe(400);
  });
});
