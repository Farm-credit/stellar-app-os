import { describe, it, expect } from 'vitest';
import { GET, POST } from '@/app/api/v2/marketplace/financing/route';

describe('GET /api/v2/marketplace/financing and POST /api/v2/marketplace/financing (#1352)', () => {
  it('GET returns credit lines successfully', async () => {
    const req = new Request('http://localhost:3000/api/v2/marketplace/financing');
    const res = await GET(req);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(Array.isArray(data.creditLines)).toBe(true);
  });

  it('POST creates a new 0% interest land prep credit line', async () => {
    const req = new Request('http://localhost:3000/api/v2/marketplace/financing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        farmerId: 'farmer-api-test',
        farmerName: 'API Farmer',
        projectName: 'API Land Prep',
        location: 'Senegal',
        requestedAmount: 4000,
        carbonProjectLinkedId: 'listing-002',
      }),
    });
    const res = await POST(req);
    const data = await res.json();
    expect(res.status).toBe(201);
    expect(data.success).toBe(true);
    expect(data.creditLine.interestRate).toBe(0.0);
    expect(data.creditLine.approvedAmount).toBe(4000);
  });
});
