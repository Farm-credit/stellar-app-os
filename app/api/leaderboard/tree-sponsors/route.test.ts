// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';
const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/lib/leaderboard/treeSponsors', () => ({ getTreeSponsorLeaderboard: get }));
describe('public leaderboard API', () => {
  it('validates filters', async () => {
    expect(
      (await GET(new NextRequest('http://localhost/api/leaderboard/tree-sponsors?period=weekly')))
        .status
    ).toBe(400);
  });
  it('returns uncached rankings for the requested category', async () => {
    get.mockResolvedValue({ entries: [] });
    const response = await GET(
      new NextRequest(
        'http://localhost/api/leaderboard/tree-sponsors?period=all-time&type=corporate'
      )
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(get).toHaveBeenCalledWith('all-time', 'corporate');
  });
  it('does not substitute mock sponsors when the database fails', async () => {
    get.mockRejectedValue(new Error('down'));
    const response = await GET(new NextRequest('http://localhost/api/leaderboard/tree-sponsors'));
    expect(response.status).toBe(503);
    expect(await response.json()).not.toHaveProperty('entries');
  });
});
