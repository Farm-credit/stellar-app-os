import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetTreeHealthForTest } from '@/lib/api/tree-health';
import { resetPushSubscriptionsForTest } from '@/lib/api/push-subscriptions';
import { setPushSenderForTest } from '@/lib/push/sender';
import { POST as SUBSCRIBE, DELETE as UNSUBSCRIBE } from '@/app/api/push/subscriptions/route';
import { POST } from './route';

vi.mock('@/lib/api/tree-registry', () => ({
  getTreeById: (id: string) =>
    Promise.resolve(id === 'tree-001' ? { id: 'tree-001', nftOwner: 'GSPONSOR' } : null),
}));

const params = (id: string) => ({ params: Promise.resolve({ id }) });
const req = (url: string, body: unknown, headers: Record<string, string> = {}, method = 'POST') =>
  new NextRequest(url, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
const auth = { authorization: 'Bearer secret' };
const url = 'http://localhost/api/trees/tree-001/health';

beforeEach(() => {
  process.env.FIELD_TEAM_API_TOKEN = 'secret';
  resetTreeHealthForTest();
  resetPushSubscriptionsForTest();
});
afterEach(() => {
  delete process.env.FIELD_TEAM_API_TOKEN;
  setPushSenderForTest(null);
});

describe('POST /api/trees/:id/health', () => {
  it('is disabled without a configured token', async () => {
    delete process.env.FIELD_TEAM_API_TOKEN;
    expect((await POST(req(url, { score: 50 }, auth), params('tree-001'))).status).toBe(503);
  });

  it('rejects a missing or wrong token', async () => {
    expect((await POST(req(url, { score: 50 }), params('tree-001'))).status).toBe(401);
    const bad = { authorization: 'Bearer nope' };
    expect((await POST(req(url, { score: 50 }, bad), params('tree-001'))).status).toBe(401);
  });

  it('pushes an alert to a subscribed sponsor end to end', async () => {
    const send = vi.fn().mockResolvedValue('sent');
    setPushSenderForTest({ configured: true, send });
    const subscription = { endpoint: 'https://push.example/1', keys: { p256dh: 'p', auth: 'a' } };
    const saved = await SUBSCRIBE(
      req('http://localhost/api/push/subscriptions', { sponsorId: 'GSPONSOR', subscription })
    );
    expect(saved.status).toBe(200);

    await POST(req(url, { score: 90 }, auth), params('tree-001'));
    const res = await POST(
      req(
        url,
        { score: 55, cause: 'drought_stress', remediation: ['Watering schedule set'] },
        auth
      ),
      params('tree-001')
    );
    const data = await res.json();
    expect(res.status).toBe(201);
    expect(data.alert.drop).toBe(35);
    expect(send).toHaveBeenCalledTimes(1);

    const removed = await UNSUBSCRIBE(
      req(
        'http://localhost/api/push/subscriptions',
        { sponsorId: 'GSPONSOR', endpoint: subscription.endpoint },
        {},
        'DELETE'
      )
    );
    expect(removed.status).toBe(200);
  });

  it('returns 404 for unknown trees and 400 for bad input', async () => {
    expect((await POST(req(url, { score: 50 }, auth), params('nope'))).status).toBe(404);
    expect((await POST(req(url, { score: 'x' }, auth), params('tree-001'))).status).toBe(400);
  });

  it('rejects an invalid subscription', async () => {
    const res = await SUBSCRIBE(
      req('http://localhost/api/push/subscriptions', {
        sponsorId: 'G',
        subscription: { endpoint: 'http://x' },
      })
    );
    expect(res.status).toBe(400);
  });
});
