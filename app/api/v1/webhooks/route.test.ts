import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db/client', () => ({ getPool: () => ({ mockedPool: true }) }));
vi.mock('@/lib/api/apiKeys', () => ({ findApiKeyByRawValue: vi.fn() }));
vi.mock('@/lib/webhook/repository', () => ({
  listSubscriptions: vi.fn(),
  insertSubscription: vi.fn(),
}));
vi.mock('@/lib/webhook/ssrf', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const Err = actual.WebhookUrlValidationError as new (msg: string) => Error;
  return {
    ...actual,
    validateWebhookUrl: vi.fn((url: string) => {
      if (url.includes('127.0.0.1') || url.includes('169.254')) {
        return Promise.reject(new Err('Blocked private IP'));
      }
      return Promise.resolve({
        url,
        hostname: 'partner.example',
        addresses: [{ address: '93.184.216.34', family: 4 }],
      });
    }),
  };
});

import { findApiKeyByRawValue } from '@/lib/api/apiKeys';
import { insertSubscription, listSubscriptions } from '@/lib/webhook/repository';
import { GET, POST } from './route';

const mockedFindKey = vi.mocked(findApiKeyByRawValue);
const mockedList = vi.mocked(listSubscriptions);
const mockedInsert = vi.mocked(insertSubscription);

beforeEach(() => {
  vi.clearAllMocks();
  process.env.WEBHOOK_SECRET_ENCRYPTION_KEY =
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
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

describe('/api/v1/webhooks', () => {
  it('rejects unauthenticated requests and OAuth2 bearer tokens with 401', async () => {
    const noAuth = await GET(new Request('https://app.example/api/v1/webhooks'));
    expect(noAuth.status).toBe(401);

    const bearer = await POST(
      new Request('https://app.example/api/v1/webhooks', {
        method: 'POST',
        headers: { Authorization: 'Bearer fake_unverified_oauth_token' },
        body: JSON.stringify({ url: 'https://partner.example/hook', events: ['credit.verified'] }),
      })
    );
    expect(bearer.status).toBe(401);
  });

  it('enforces webhooks:read and webhooks:write scopes with 403', async () => {
    mockedFindKey.mockResolvedValueOnce({
      id: 42,
      name: 'ReadOnly Key',
      prefix: 'fc_readonly',
      key_hash: 'hash',
      tier: 'free',
      owner_wallet: null,
      scopes: ['webhooks:read'],
      is_active: true,
      created_at: new Date(),
      last_used_at: null,
      revoked_at: null,
    });

    const res = await POST(
      new Request('https://app.example/api/v1/webhooks', {
        method: 'POST',
        headers: { 'x-api-key': 'fc_valid_key' },
        body: JSON.stringify({ url: 'https://partner.example/hook', events: ['credit.verified'] }),
      })
    );
    expect(res.status).toBe(403);
  });

  it('rejects SSRF URLs on POST with 400 and creates valid subscriptions with one-time whsec_* secret', async () => {
    const ssrfRes = await POST(
      new Request('https://app.example/api/v1/webhooks', {
        method: 'POST',
        headers: { 'x-api-key': 'fc_valid_key', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: 'https://169.254.169.254/latest/meta-data',
          events: ['credit.verified'],
        }),
      })
    );
    expect(ssrfRes.status).toBe(400);

    mockedInsert.mockResolvedValueOnce({
      id: 7,
      public_id: '11111111-1111-1111-1111-111111111111',
      planter_id: null,
      client_id: 'fc_1234abcd',
      api_key_id: 42,
      owner_wallet: null,
      url: 'https://partner.example/hook',
      description: null,
      event_types: [
        'credit.verified',
        'project.approved',
        'credit.retired',
        'price.changed',
        'project.status.changed',
      ],
      is_active: true,
      secret_last_four: 'abcd',
      secret_rotated_at: null,
      previous_secret_expires_at: null,
      consecutive_failures: 0,
      last_delivery_at: null,
      last_delivery_status: null,
      disabled_at: null,
      disabled_reason: null,
      created_at: new Date('2026-01-01T00:00:00.000Z'),
      updated_at: new Date('2026-01-01T00:00:00.000Z'),
      deleted_at: null,
    });

    const okRes = await POST(
      new Request('https://app.example/api/v1/webhooks', {
        method: 'POST',
        headers: { 'x-api-key': 'fc_valid_key', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: 'https://partner.example/hook',
          events: [
            'credit.verified',
            'project.approved',
            'credit.retired',
            'price.changed',
            'project.status.changed',
          ],
        }),
      })
    );
    expect(okRes.status).toBe(201);
    const json = await okRes.json();
    expect(json.secret).toMatch(/^whsec_/);
    expect(json.id).toBe('11111111-1111-1111-1111-111111111111');
  });

  it('lists caller-scoped subscriptions without exposing secrets on GET', async () => {
    mockedList.mockResolvedValueOnce([
      {
        id: 7,
        public_id: '11111111-1111-1111-1111-111111111111',
        planter_id: null,
        client_id: 'fc_1234abcd',
        api_key_id: 42,
        owner_wallet: null,
        url: 'https://partner.example/hook',
        description: null,
        event_types: ['credit.verified'],
        is_active: true,
        secret_last_four: '9999',
        secret_rotated_at: null,
        previous_secret_expires_at: null,
        consecutive_failures: 0,
        last_delivery_at: null,
        last_delivery_status: null,
        disabled_at: null,
        disabled_reason: null,
        created_at: new Date('2026-01-01T00:00:00.000Z'),
        updated_at: new Date('2026-01-01T00:00:00.000Z'),
        deleted_at: null,
      },
    ]);

    const res = await GET(
      new Request('https://app.example/api/v1/webhooks', {
        headers: { 'x-api-key': 'fc_valid_key' },
      })
    );
    expect(res.status).toBe(200);
    expect(mockedList).toHaveBeenCalledWith(expect.anything(), { apiKeyId: 42 });
    const body = await res.json();
    expect(body.subscriptions[0].secret).toBeUndefined();
    expect(body.subscriptions[0].maskedSecret).toBe('whsec_••••9999');
  });
});
