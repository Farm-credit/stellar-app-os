import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getDonorWall } = vi.hoisted(() => ({ getDonorWall: vi.fn() }));
vi.mock('@/lib/donor-wall/service', () => ({ getDonorWall }));
vi.mock('@/lib/logger', () => ({ default: { error: vi.fn(), info: vi.fn() } }));

import { GET } from './route';

beforeEach(() => vi.clearAllMocks());

describe('GET /api/donor-wall', () => {
  it('returns the wall with a public cache header', async () => {
    const wall = {
      generatedAt: '2026-10-21T00:00:00.000Z',
      entries: [{ name: 'Acme', logoUrl: null, totalTrees: 1200, tier: 'platinum' }],
    };
    getDonorWall.mockResolvedValue(wall);

    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toContain('s-maxage');
    expect(await res.json()).toEqual(wall);
  });

  it('returns 500 when the wall cannot be loaded', async () => {
    getDonorWall.mockRejectedValue(new Error('db down'));
    const res = await GET();
    expect(res.status).toBe(500);
  });
});
