// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { Keypair } from '@stellar/stellar-sdk';
import { GET, PUT } from './route';
const mocks = vi.hoisted(() => ({ verify: vi.fn(), get: vi.fn(), save: vi.fn() }));
vi.mock('@/lib/auth/jwt', () => ({ verifyPlanterJwt: mocks.verify }));
vi.mock('@/lib/leaderboard/treeSponsors', () => ({
  getLeaderboardPreferences: mocks.get,
  saveLeaderboardPreferences: mocks.save,
}));
const wallet = Keypair.random().publicKey();
const preferences = { optedIn: true, displayName: 'Alice', sponsorType: 'individual' };
const request = (body?: unknown, auth = true) =>
  new NextRequest('http://localhost/api/leaderboard/preferences', {
    method: body === undefined ? 'GET' : 'PUT',
    headers: auth ? { Authorization: 'Bearer test' } : {},
    body: body === undefined ? undefined : JSON.stringify(body),
  });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.verify.mockResolvedValue({ type: 'access', sub: wallet });
  mocks.get.mockResolvedValue(preferences);
  mocks.save.mockResolvedValue(undefined);
});
describe('leaderboard privacy API', () => {
  it('requires authentication for both reads and writes', async () => {
    expect((await GET(request(undefined, false))).status).toBe(401);
    expect((await PUT(request(preferences, false))).status).toBe(401);
    expect(mocks.get).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it.each([null, { type: 'refresh', sub: wallet }, { type: 'access', sub: 'invalid' }])(
    'rejects invalid/refresh credentials',
    async (payload) => {
      mocks.verify.mockResolvedValue(payload);
      expect((await PUT(request(preferences))).status).toBe(401);
      expect(mocks.save).not.toHaveBeenCalled();
    }
  );
  it('binds changes to the authenticated subject and disallows a submitted wallet', async () => {
    expect((await PUT(request({ ...preferences, wallet: 'someone-else' }))).status).toBe(400);
    expect((await PUT(request(preferences))).status).toBe(200);
    expect(mocks.save).toHaveBeenCalledTimes(1);
    expect(mocks.save).toHaveBeenCalledWith(wallet, preferences);
  });
  it.each([
    { ...preferences, displayName: '  ' },
    { ...preferences, displayName: 'x'.repeat(81) },
    { ...preferences, sponsorType: 'admin' },
    { ...preferences, optedIn: 'false' },
  ])('validates preferences', async (body) => {
    expect((await PUT(request(body))).status).toBe(400);
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it('allows opt-out without a name and prevents caching private responses', async () => {
    const response = await PUT(request({ ...preferences, optedIn: false, displayName: '' }));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect((await GET(request())).headers.get('cache-control')).toBe('private, no-store');
  });
  it('reports persistence failures without claiming success', async () => {
    mocks.save.mockRejectedValue(new Error('database down'));
    expect((await PUT(request(preferences))).status).toBe(503);
  });
});
