import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api/farmer-verification-auth', () => ({
  authenticateFarmerVerificationRequest: vi.fn().mockResolvedValue({
    ok: true,
    client: { id: 7, name: 'test', prefix: 'fc_test', tier: 'standard' },
  }),
}));

import { POST as SYNC_PROJECT } from './projects/sync/route';
import { POST as VERIFY_CREDIT } from './credits/verify/route';
import { GET as GET_RENEWAL } from './renewals/route';
import { resetCertificationRuntimeForTests } from '@/lib/certification/runtime';

const BASE = 'http://localhost:3000/api/v2/marketplace/certifications';

function post(path: string, body: unknown, raw = false): Request {
  return new Request(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': 'fc_test' },
    body: raw ? String(body) : JSON.stringify(body),
  });
}

describe('certification API route validation', () => {
  beforeEach(() => resetCertificationRuntimeForTests());

  it('rejects malformed JSON', async () => {
    const response = await SYNC_PROJECT(post('/projects/sync', '{bad json', true));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Request body must be valid JSON',
    });
  });

  it('rejects unsupported providers and unknown fields', async () => {
    const response = await SYNC_PROJECT(
      post('/projects/sync', { provider: 'other', projectId: 'P-1', apiToken: 'leak' })
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe('Invalid certification project request');
    expect(body.details.join(' ')).toContain('provider');
  });

  it('rejects malformed verification quantities before calling a provider', async () => {
    const response = await VERIFY_CREDIT(
      post('/credits/verify', {
        provider: 'verra',
        projectId: 'VCS-1913',
        serialNumber: 'VCU-1',
        quantity: -5,
      })
    );

    expect(response.status).toBe(400);
    expect((await response.json()).details.join(' ')).toContain('quantity');
  });

  it('requires renewal query parameters', async () => {
    const response = await GET_RENEWAL(
      new Request(`${BASE}/renewals?provider=verra`, { headers: { 'x-api-key': 'fc_test' } })
    );

    expect(response.status).toBe(400);
    expect((await response.json()).details.join(' ')).toContain('projectId');
  });

  it('explicitly reports an unconfigured provider instead of using mock data', async () => {
    const response = await SYNC_PROJECT(
      post('/projects/sync', { provider: 'verra', projectId: 'VCS-1913' })
    );
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.code).toBe('PROVIDER_NOT_CONFIGURED');
    expect(body).not.toHaveProperty('apiToken');
  });
});
