import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '../route';
import { mockAllTimeSponsors } from '@/lib/api/mock/leaderboard';

describe('GET /api/sponsors/:sponsorId/impact-score', () => {
  it('returns 404 for non-existent sponsor', async () => {
    const request = new NextRequest('http://localhost:3000/api/sponsors/unknown/impact-score');
    const response = await GET(request, {
      params: Promise.resolve({ sponsorId: 'unknown-address' }),
    });

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.success).toBe(false);
  });

  it('returns impact score data out of 1000 for valid sponsor', async () => {
    const sponsor = mockAllTimeSponsors[0];
    const request = new NextRequest(
      `http://localhost:3000/api/sponsors/${sponsor.address}/impact-score`
    );
    const response = await GET(request, {
      params: Promise.resolve({ sponsorId: sponsor.address }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.maxScore).toBe(1000);
    expect(body.data.totalScore).toBeGreaterThanOrEqual(0);
    expect(body.data.totalScore).toBeLessThanOrEqual(1000);
    expect(body.data.factors.treesFunded).toBeDefined();
    expect(body.data.factors.speciesDiversity).toBeDefined();
    expect(body.data.factors.geographicSpread).toBeDefined();
    expect(body.data.factors.yearsOfEngagement).toBeDefined();
  });

  it('handles simulated query parameters', async () => {
    const sponsor = mockAllTimeSponsors[0];
    const request = new NextRequest(
      `http://localhost:3000/api/sponsors/${sponsor.address}/impact-score?trees=500&species=10&regions=5&years=3`
    );
    const response = await GET(request, {
      params: Promise.resolve({ sponsorId: sponsor.address }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.isSimulated).toBe(true);
    expect(body.data.totalScore).toBe(1000);
  });
});
