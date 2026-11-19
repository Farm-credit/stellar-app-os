import { createHash } from 'node:crypto';
import { Keypair } from '@stellar/stellar-sdk';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { generateNonce, consumeNonce, verifyPlanterJwt, signPlanterJwt } = vi.hoisted(() => ({
  generateNonce: vi.fn(),
  consumeNonce: vi.fn(),
  verifyPlanterJwt: vi.fn(),
  signPlanterJwt: vi.fn(),
}));
vi.mock('@/lib/auth/nonce', () => ({ generateNonce, consumeNonce }));
vi.mock('@/lib/auth/jwt', () => ({ verifyPlanterJwt, signPlanterJwt }));
import { GET, POST } from '@/app/api/planting/events/session/route';
import { requireSameOrigin, volunteerWallet } from './auth';

const origin = 'http://localhost:3000';
const key = Keypair.random();
const nonce = 'b12e196e-f678-4b6f-a026-956c466a2def';
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('JWT_SECRET', 'test-only-secret');
  generateNonce.mockResolvedValue(nonce);
  consumeNonce.mockResolvedValue(true);
  signPlanterJwt.mockResolvedValue('signed-access-token');
});

describe('volunteer wallet session', () => {
  it('uses the browser host when Next normalizes the internal URL', () => {
    const request = (requestOrigin: string) =>
      new NextRequest(`${origin}/api/planting/events`, {
        method: 'POST',
        headers: { host: '127.0.0.1:3000', origin: requestOrigin },
      });
    expect(() => requireSameOrigin(request('http://127.0.0.1:3000'))).not.toThrow();
    expect(() => requireSameOrigin(request('https://attacker.test'))).toThrow();
  });

  it('verifies a domain-bound SEP-53 message and sets an HttpOnly cookie', async () => {
    const challenge = await GET(
      new NextRequest(`${origin}/api/planting/events/session?wallet=${key.publicKey()}`)
    );
    const body = await challenge.json();
    const signature = key
      .sign(createHash('sha256').update('Stellar Signed Message:\n').update(body.message).digest())
      .toString('base64');
    const response = await POST(
      new NextRequest(`${origin}/api/planting/events/session`, {
        method: 'POST',
        headers: { origin, 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: key.publicKey(), nonce, signature }),
      })
    );
    expect(response.status).toBe(200);
    expect(signPlanterJwt).toHaveBeenCalledWith(key.publicKey());
    expect(response.headers.get('set-cookie')).toContain('HttpOnly');
    expect(response.headers.get('set-cookie')).toContain('SameSite=strict');
  });

  it('rejects replayed nonces, forged signatures, and cross-origin requests', async () => {
    const request = (requestOrigin = origin) =>
      new NextRequest(`${origin}/api/planting/events/session`, {
        method: 'POST',
        headers: { origin: requestOrigin },
        body: JSON.stringify({
          wallet: key.publicKey(),
          nonce,
          signature: Buffer.alloc(64).toString('base64'),
        }),
      });
    expect((await POST(request('https://attacker.test'))).status).toBe(403);
    expect(consumeNonce).not.toHaveBeenCalled();
    consumeNonce.mockResolvedValueOnce(false);
    expect((await POST(request())).status).toBe(401);
    expect((await POST(request())).status).toBe(401);
    expect(signPlanterJwt).not.toHaveBeenCalled();
  });

  it('rejects refresh tokens, missing sessions and cookie writes without same-origin proof', async () => {
    await expect(
      volunteerWallet(new NextRequest(`${origin}/api/planting/events`))
    ).rejects.toMatchObject({ status: 401 });
    verifyPlanterJwt.mockResolvedValue({ sub: key.publicKey(), role: 'planter', type: 'refresh' });
    await expect(
      volunteerWallet(
        new NextRequest(`${origin}/api/planting/events`, {
          headers: { authorization: 'Bearer refresh' },
        })
      )
    ).rejects.toMatchObject({ status: 401 });
    await expect(
      volunteerWallet(
        new NextRequest(`${origin}/api/planting/events`, {
          method: 'POST',
          headers: { cookie: 'farmcredit_volunteer_session=token' },
        })
      )
    ).rejects.toMatchObject({ status: 403 });
    verifyPlanterJwt.mockResolvedValue({ sub: key.publicKey(), role: 'planter', type: 'access' });
    expect(
      await volunteerWallet(
        new NextRequest(`${origin}/api/planting/events`, {
          headers: { authorization: 'Bearer valid' },
        })
      )
    ).toBe(key.publicKey());
  });
});
