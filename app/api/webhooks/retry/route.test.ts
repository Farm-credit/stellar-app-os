import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

vi.mock('@/lib/auth/admin', () => ({ isAdminRequest: vi.fn() }));
vi.mock('@/lib/db/client', () => ({ getPool: () => ({ mockedPool: true }) }));
vi.mock('@/lib/webhook/dispatch', () => ({ retryDelivery: vi.fn() }));

import { isAdminRequest } from '@/lib/auth/admin';
import { retryDelivery } from '@/lib/webhook/dispatch';
import { POST } from './route';

const mockedAdmin = vi.mocked(isAdminRequest);
const mockedRetry = vi.mocked(retryDelivery);

beforeEach(() => {
  vi.clearAllMocks();
  mockedAdmin.mockResolvedValue(true);
});

describe('POST /api/webhooks/retry', () => {
  it('returns 401 when caller is not admin', async () => {
    mockedAdmin.mockResolvedValueOnce(false);
    const res = await POST(
      new Request('https://app.example/api/webhooks/retry', {
        method: 'POST',
        body: JSON.stringify({ deliveryId: 1 }),
      }) as NextRequest
    );
    expect(res.status).toBe(401);
  });

  it('retries delivery by numeric deliveryId for admin', async () => {
    mockedRetry.mockResolvedValueOnce({
      id: 12,
      status: 'success',
      attempt_count: 2,
      http_status: 200,
      next_attempt_at: null,
    } as never);

    const res = await POST(
      new Request('https://app.example/api/webhooks/retry', {
        method: 'POST',
        body: JSON.stringify({ deliveryId: 12 }),
      }) as NextRequest
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      success: true,
      deliveryId: 12,
      status: 'success',
    });
  });
});
