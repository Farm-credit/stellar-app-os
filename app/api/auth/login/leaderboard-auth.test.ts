// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { Keypair, hash } from '@stellar/stellar-sdk';
import { POST } from './route';
const mocks = vi.hoisted(() => ({ consume: vi.fn(), sign: vi.fn() }));
vi.mock('@/lib/auth/nonce', () => ({ consumeNonce: mocks.consume }));
vi.mock('@/lib/auth/jwt', () => ({ signPlanterJwt: mocks.sign, verifyPlanterJwt: vi.fn() }));
vi.mock('@/lib/db/user', () => ({ getUserData: vi.fn(), deleteUserData: vi.fn() }));
vi.mock('@/lib/logger', () => ({ default: { info: vi.fn(), error: vi.fn() } }));
const key = Keypair.random();
const nonce = 'single-use-test-nonce';
const message = `stellar-auth:${nonce}`;
function request(scheme: 'raw' | 'sep53') {
  const bytes =
    scheme === 'sep53'
      ? hash(Buffer.from(`Stellar Signed Message:\n${message}`))
      : Buffer.from(message);
  return new NextRequest('http://localhost/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      walletAddress: key.publicKey(),
      nonce,
      signature: key.sign(bytes).toString('base64'),
      scheme,
    }),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.consume.mockResolvedValue(true);
  mocks.sign.mockResolvedValue('access-token');
});
describe('leaderboard wallet authentication', () => {
  it.each(['raw', 'sep53'] as const)(
    'authenticates %s clients through the existing nonce flow',
    async (scheme) => {
      const response = await POST(request(scheme));
      expect(response.status).toBe(200);
      expect(await response.json()).toHaveProperty('token', 'access-token');
      expect(mocks.consume).toHaveBeenCalledWith(key.publicKey(), nonce);
      expect(mocks.sign).toHaveBeenCalledWith(key.publicKey());
    }
  );
  it('rejects consumed nonces before issuing an access token', async () => {
    mocks.consume.mockResolvedValue(false);
    expect((await POST(request('sep53'))).status).toBe(401);
    expect(mocks.sign).not.toHaveBeenCalled();
  });
});
