import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { mockAllTimeSponsors } from '@/lib/api/mock/leaderboard';
import { GET } from './route';
import { GET as IMAGE } from './[badgeId]/image/route';

const top = mockAllTimeSponsors.reduce((a, b) => (b.totalTrees > a.totalTrees ? b : a));
const call = (sponsorId: string) =>
  GET(new NextRequest(`http://localhost/api/sponsors/${sponsorId}/badges`), {
    params: Promise.resolve({ sponsorId }),
  });
const image = (sponsorId: string, badgeId: string) =>
  IMAGE(new NextRequest(`http://localhost/x`), { params: Promise.resolve({ sponsorId, badgeId }) });

describe('GET /api/sponsors/:id/badges', () => {
  it('returns 404 for an unknown sponsor', async () => {
    expect((await call('GUNKNOWN')).status).toBe(404);
  });

  it('lists all five badges with image links only for earned ones', async () => {
    const res = await call(top.address);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.badges).toHaveLength(5);
    const first = data.badges.find((b: { id: string }) => b.id === 'first-tree');
    expect(first.earned).toBe(true);
    expect(first.imageUrl).toBe(`/api/sponsors/${top.address}/badges/first-tree/image`);
    for (const b of data.badges) {
      expect(b.imageUrl === null).toBe(!b.earned);
    }
  });
});

describe('share image', () => {
  it('renders a PNG for an earned badge', async () => {
    const res = await image(top.address, 'first-tree');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
  });

  it('404s for a badge that is not earned or does not exist', async () => {
    expect((await image(top.address, 'nope')).status).toBe(404);
    expect((await image('GUNKNOWN', 'first-tree')).status).toBe(404);
  });
});
