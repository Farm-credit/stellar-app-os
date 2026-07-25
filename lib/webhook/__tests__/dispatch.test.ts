import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Pool } from 'pg';
import { attemptDelivery, deliver, dispatchEvent } from '@/lib/webhook/dispatch';
import * as repository from '@/lib/webhook/repository';
import { WEBHOOK_HEADERS, verifySignature } from '@/lib/webhook/signature';
import type { RecordAttemptParams } from '@/lib/webhook/repository';
import type {
  WebhookDeliveryRow,
  WebhookEnvelope,
  WebhookSubscriptionRow,
} from '@/lib/webhook/types';

vi.mock('@/lib/webhook/repository');

const mockedRepo = vi.mocked(repository);

// The pool is never touched directly — repository is fully mocked.
const fakePool = {} as Pool;

function makeSubscription(overrides: Partial<WebhookSubscriptionRow> = {}): WebhookSubscriptionRow {
  return {
    id: 1,
    planter_id: 10,
    url: 'https://planter.example/webhooks',
    secret: 'whsec_unit_test_secret_padding_padding',
    event_types: [],
    is_active: true,
    created_at: new Date('2026-01-01T00:00:00Z'),
    updated_at: new Date('2026-01-01T00:00:00Z'),
    deleted_at: null,
    ...overrides,
  };
}

function makeDelivery(overrides: Partial<WebhookDeliveryRow> = {}): WebhookDeliveryRow {
  return {
    id: 100,
    event_id: '11111111-1111-1111-1111-111111111111',
    subscription_id: 1,
    event_type: 'milestone.payout.approved',
    payload: { loanId: 'loan_1' },
    status: 'pending',
    http_status: null,
    response_body: null,
    error_message: null,
    attempt_count: 0,
    max_attempts: 6,
    next_attempt_at: null,
    delivered_at: null,
    created_at: new Date('2026-01-01T00:00:00Z'),
    updated_at: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function fetchResponse(status: number, body = ''): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(body),
  } as Response;
}

beforeEach(() => {
  vi.clearAllMocks();
  // recordAttemptResult echoes the new state back as the updated row.
  mockedRepo.recordAttemptResult.mockImplementation((_pool: Pool, p: RecordAttemptParams) =>
    Promise.resolve(
      makeDelivery({
        id: p.deliveryId,
        status: p.status,
        attempt_count: p.attemptCount,
        http_status: p.httpStatus,
        response_body: p.responseBody,
        error_message: p.errorMessage,
        next_attempt_at: p.nextAttemptAt,
        delivered_at: p.deliveredAt,
      })
    )
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('deliver', () => {
  it('signs the request and returns ok on 2xx', async () => {
    const secret = 'whsec_unit_test_secret_padding_padding';
    let captured: { url: string; init: RequestInit } | null = null;
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init: RequestInit) => {
        captured = { url, init };
        return Promise.resolve(fetchResponse(200, 'ok'));
      })
    );

    const envelope: WebhookEnvelope = {
      id: 'evt_1',
      type: 'milestone.payout.approved',
      createdAt: '2026-01-01T00:00:00.000Z',
      data: { loanId: 'loan_1' },
    };

    const result = await deliver('https://planter.example/hook', secret, envelope, 5_000);

    expect(result.ok).toBe(true);
    expect(result.httpStatus).toBe(200);
    expect(captured).not.toBeNull();

    const headers = captured!.init.headers as Record<string, string>;
    const body = captured!.init.body as string;
    expect(headers[WEBHOOK_HEADERS.id]).toBe('evt_1');
    // The signature on the wire must verify against the exact body sent.
    expect(
      verifySignature(
        body,
        secret,
        headers[WEBHOOK_HEADERS.timestamp],
        headers[WEBHOOK_HEADERS.signature],
        { now: Number(headers[WEBHOOK_HEADERS.timestamp]) }
      )
    ).toBe(true);
  });

  it('returns not-ok with the status on a 5xx', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(fetchResponse(503, 'down')))
    );
    const result = await deliver('https://x.example', 'secret', {
      id: 'e',
      type: 'milestone.payout.approved',
      createdAt: '2026-01-01T00:00:00.000Z',
      data: {},
    });
    expect(result.ok).toBe(false);
    expect(result.httpStatus).toBe(503);
    expect(result.error).toContain('503');
  });

  it('returns an error (never throws) on network failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        throw new Error('ECONNREFUSED');
      })
    );
    const result = await deliver('https://x.example', 'secret', {
      id: 'e',
      type: 'milestone.payout.approved',
      createdAt: '2026-01-01T00:00:00.000Z',
      data: {},
    });
    expect(result.ok).toBe(false);
    expect(result.httpStatus).toBeNull();
    expect(result.error).toContain('ECONNREFUSED');
  });
});

describe('attemptDelivery', () => {
  it('marks success and clears retry scheduling on 2xx', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(fetchResponse(200, 'ok')))
    );

    const row = await attemptDelivery(fakePool, makeDelivery(), makeSubscription());

    expect(row.status).toBe('success');
    expect(row.attempt_count).toBe(1);
    expect(row.delivered_at).not.toBeNull();
    const p = mockedRepo.recordAttemptResult.mock.calls[0][1];
    expect(p.status).toBe('success');
    expect(p.nextAttemptAt).toBeNull();
  });

  it('schedules a future retry on failure when budget remains', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(fetchResponse(500, 'boom')))
    );

    const before = Date.now();
    const row = await attemptDelivery(
      fakePool,
      makeDelivery({ attempt_count: 0, max_attempts: 6 }),
      makeSubscription()
    );

    expect(row.status).toBe('retrying');
    expect(row.attempt_count).toBe(1);
    expect(row.next_attempt_at).toBeInstanceOf(Date);
    expect((row.next_attempt_at as Date).getTime()).toBeGreaterThan(before);
  });

  it('marks failed (no further retry) once the budget is exhausted', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(fetchResponse(500, 'boom')))
    );

    const row = await attemptDelivery(
      fakePool,
      makeDelivery({ attempt_count: 5, max_attempts: 6 }),
      makeSubscription()
    );

    expect(row.status).toBe('failed');
    expect(row.attempt_count).toBe(6);
    expect(row.next_attempt_at).toBeNull();
  });
});

describe('dispatchEvent', () => {
  it('creates and attempts one delivery per matching subscription', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(fetchResponse(200, 'ok')))
    );

    mockedRepo.getActiveSubscriptionsForEvent.mockResolvedValue([
      makeSubscription({ id: 1 }),
      makeSubscription({ id: 2, url: 'https://other.example/hook' }),
    ]);
    mockedRepo.insertDelivery.mockImplementation(
      (_pool: Pool, params: Parameters<typeof repository.insertDelivery>[1]) =>
        Promise.resolve(makeDelivery({ subscription_id: params.subscriptionId }))
    );

    const rows = await dispatchEvent(fakePool, 'milestone.payout.approved', { loanId: 'loan_9' });

    expect(rows).toHaveLength(2);
    expect(mockedRepo.insertDelivery).toHaveBeenCalledTimes(2);
    expect(rows.every((r) => r.status === 'success')).toBe(true);
  });

  it('does nothing when there are no subscriptions', async () => {
    mockedRepo.getActiveSubscriptionsForEvent.mockResolvedValue([]);
    const rows = await dispatchEvent(fakePool, 'milestone.payout.approved', {});
    expect(rows).toHaveLength(0);
    expect(mockedRepo.insertDelivery).not.toHaveBeenCalled();
  });
});
