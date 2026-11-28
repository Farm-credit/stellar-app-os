import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db/client', () => ({ getPool: () => ({ mockedPool: true }) }));
vi.mock('@/lib/api/apiKeys', () => ({ findApiKeyByRawValue: vi.fn() }));
vi.mock('@/lib/webhook/repository', () => ({
  getSubscriptionByPublicId: vi.fn(),
  softDeleteSubscription: vi.fn(),
  updateSubscription: vi.fn(),
}));

import { findApiKeyByRawValue } from '@/lib/api/apiKeys';
import {
  getSubscriptionByPublicId,
  softDeleteSubscription,
  updateSubscription,
} from '@/lib/webhook/repository';
import { DELETE, GET, PATCH } from './route';

const SUB_UUID = '11111111-1111-1111-1111-111111111111';
const mockedFindKey = vi.mocked(findApiKeyByRawValue);
const mockedGet = vi.mocked(getSubscriptionByPublicId);
const mockedUpdate = vi.mocked(updateSubscription);
const mockedDelete = vi.mocked(softDeleteSubscription);

beforeEach(() => {
  vi.clearAllMocks();
  mockedFindKey.mockResolvedValue({
    id: 42,
    name: 'Partner ESG',
    prefix: 'fc_1234abcd',
    key_hash: 'hash',
    tier: 'standard',
    owner_wallet: null,
    scopes: ['webhooks:read', 'webhooks:write'],
    is_active: true,
    created_at: new Date(),
    last_used_at: null,
    revoked_at: null,
  });
});

describe('/api/v1/webhooks/[id]', () => {
  it('returns 404 when subscription is not owned by caller or missing', async () => {
    mockedGet.mockResolvedValueOnce(null);
    const res = await GET(
      new Request(`https://app.example/api/v1/webhooks/${SUB_UUID}`, {
        headers: { 'x-api-key': 'fc_valid_key' },
      }),
      { params: Promise.resolve({ id: SUB_UUID }) }
    );
    expect(res.status).toBe(404);
  });

  it('updates subscription active flag and events via PATCH', async () => {
    mockedUpdate.mockResolvedValueOnce({
      id: 7,
      public_id: SUB_UUID,
      planter_id: null,
      client_id: 'fc_1234abcd',
      api_key_id: 42,
      owner_wallet: null,
      url: 'https://partner.example/hook',
      description: 'Updated',
      event_types: ['price.changed'],
      is_active: false,
      secret_last_four: '9999',
      secret_rotated_at: null,
      previous_secret_expires_at: null,
      consecutive_failures: 0,
      last_delivery_at: null,
      last_delivery_status: null,
      disabled_at: null,
      disabled_reason: null,
      created_at: new Date('2026-01-01T00:00:00.000Z'),
      updated_at: new Date('2026-01-02T00:00:00.000Z'),
      deleted_at: null,
    });

    const res = await PATCH(
      new Request(`https://app.example/api/v1/webhooks/${SUB_UUID}`, {
        method: 'PATCH',
        headers: { 'x-api-key': 'fc_valid_key', 'Content-Type': 'application/json' },
        body: JSON.stringify({ events: ['price.changed'], active: false, description: 'Updated' }),
      }),
      { params: Promise.resolve({ id: SUB_UUID }) }
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.active).toBe(false);
    expect(json.events).toEqual(['price.changed']);
  });

  it('soft-deletes subscription on DELETE and returns 204', async () => {
    mockedDelete.mockResolvedValueOnce(true);
    const res = await DELETE(
      new Request(`https://app.example/api/v1/webhooks/${SUB_UUID}`, {
        method: 'DELETE',
        headers: { 'x-api-key': 'fc_valid_key' },
      }),
      { params: Promise.resolve({ id: SUB_UUID }) }
    );
    expect(res.status).toBe(204);
  });
});
