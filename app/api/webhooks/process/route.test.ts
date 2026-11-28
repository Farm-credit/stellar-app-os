import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

vi.mock('@/lib/db/client', () => ({ getPool: () => ({ mockedPool: true }) }));
vi.mock('@/lib/webhook/dispatch', () => ({ processDueDeliveries: vi.fn() }));

import { processDueDeliveries } from '@/lib/webhook/dispatch';
import { GET, POST } from './route';

const mockedProcess = vi.mocked(processDueDeliveries);

beforeEach(() => {
  vi.clearAllMocks();
  process.env.WEBHOOK_CRON_SECRET = 'cron-secret-test-value';
});

describe('/api/webhooks/process', () => {
  it('returns 503 when secret is unconfigured and 401 when unauthorized', async () => {
    delete process.env.WEBHOOK_CRON_SECRET;
    delete process.env.CRON_SECRET;
    const unconfigured = await GET(
      new Request('https://app.example/api/webhooks/process') as NextRequest
    );
    expect(unconfigured.status).toBe(503);

    process.env.WEBHOOK_CRON_SECRET = 'cron-secret-test-value';
    const unauthorized = await POST(
      new Request('https://app.example/api/webhooks/process', {
        method: 'POST',
        headers: { Authorization: 'Bearer wrong' },
      }) as NextRequest
    );
    expect(unauthorized.status).toBe(401);
  });

  it('processes due deliveries for both GET (Vercel cron) and POST', async () => {
    mockedProcess.mockResolvedValue([
      { status: 'success' },
      { status: 'retrying' },
      { status: 'failed' },
    ] as never);

    const getRes = await GET(
      new Request('https://app.example/api/webhooks/process', {
        headers: { Authorization: 'Bearer cron-secret-test-value' },
      }) as NextRequest
    );
    expect(getRes.status).toBe(200);
    await expect(getRes.json()).resolves.toEqual({
      processed: 3,
      succeeded: 1,
      stillRetrying: 1,
      failed: 1,
    });

    const postRes = await POST(
      new Request('https://app.example/api/webhooks/process', {
        method: 'POST',
        headers: { Authorization: 'Bearer cron-secret-test-value' },
      }) as NextRequest
    );
    expect(postRes.status).toBe(200);
  });
});
