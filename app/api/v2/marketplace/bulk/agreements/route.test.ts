import { describe, it, expect } from 'vitest';
import { GET, POST } from './route';

describe('API /api/v2/marketplace/bulk/agreements', () => {
  it('returns existing bulk agreements on GET', async () => {
    const req = new Request('http://localhost/api/v2/marketplace/bulk/agreements');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.agreements)).toBe(true);
    expect(body.count).toBeGreaterThanOrEqual(1);
  });

  it('rejects POST when committedTons is below 100', async () => {
    const req = new Request('http://localhost/api/v2/marketplace/bulk/agreements', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        buyer: {
          walletAddress: 'GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVVO5',
          organizationName: 'Small Buyer',
          contactEmail: 'buyer@example.com',
        },
        farmer: {
          walletAddress: 'GBTY4NZN2U4W7UUG6OXQ6K3YJ3KVRQZ2W5T4WJJL32OEVH2K2ZVRJ6QO',
          name: 'Samuel Kiprop',
          farmName: 'Rift Valley Co-op',
          region: 'Nakuru, Kenya',
        },
        projectId: 'proj-005',
        projectName: 'Sustainable Agriculture - Kenya',
        committedTons: 50,
        standardPricePerTon: 40,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/minimum batch commitment of 100/i);
  });

  it('creates a 100+ ton bulk purchase agreement on POST', async () => {
    const req = new Request('http://localhost/api/v2/marketplace/bulk/agreements', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        buyer: {
          walletAddress: 'GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVVO5',
          organizationName: 'Global Carbon Corp',
          contactEmail: 'procurement@globalcarbon.example',
        },
        farmer: {
          walletAddress: 'GBTY4NZN2U4W7UUG6OXQ6K3YJ3KVRQZ2W5T4WJJL32OEVH2K2ZVRJ6QO',
          name: 'Samuel Kiprop',
          farmName: 'Rift Valley Co-op',
          region: 'Nakuru, Kenya',
        },
        projectId: 'proj-005',
        projectName: 'Sustainable Agriculture - Kenya',
        committedTons: 150,
        standardPricePerTon: 40,
        negotiatedPricePerTon: 35,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.agreement.committedTons).toBe(150);
    expect(body.agreement.negotiatedPricePerTon).toBe(35);
    expect(body.agreement.totalValueUsd).toBe(5250);
  });
});
