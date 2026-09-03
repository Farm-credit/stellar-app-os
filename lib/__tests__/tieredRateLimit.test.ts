import { describe, it, expect, beforeEach, vi } from 'vitest';
import { checkTieredRateLimit, queuedRequestCount, dequeueRequest } from '../tieredRateLimit';

vi.mock('@/lib/api/apiKeys', () => ({
  hashKey: (s: string) => s,
}));

describe('checkTieredRateLimit (in-memory fallback)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows free-tier requests up to 100 per hour', async () => {
    const key = 'sk_test_free';
    for (let i = 0; i < 100; i++) {
      const r = await checkTieredRateLimit(key, 'free');
      expect(r.allowed).toBe(true);
      expect(r.limited).toBe(false);
    }
  });

  it('queues free-tier requests once the 100/hr budget is exhausted', async () => {
    const key = 'sk_test_free2';
    for (let i = 0; i < 100; i++) {
      await checkTieredRateLimit(key, 'free');
    }
    const blocked = await checkTieredRateLimit(key, 'free');
    expect(blocked.allowed).toBe(false);
    expect(blocked.limited).toBe(true);
    expect(blocked.queued).toBe(true);
    expect(blocked.retryAfter).toBeGreaterThan(0);
    expect(await queuedRequestCount(key)).toBe(1);
    expect(await dequeueRequest(key)).not.toBeNull();
    expect(await queuedRequestCount(key)).toBe(0);
  });

  it('resets the window after one hour elapses', async () => {
    const key = 'sk_test_free3';
    for (let i = 0; i < 100; i++) {
      await checkTieredRateLimit(key, 'free');
    }
    const blocked = await checkTieredRateLimit(key, 'free');
    expect(blocked.allowed).toBe(false);

    vi.advanceTimersByTime(3_600_000);
    const allowed = await checkTieredRateLimit(key, 'free');
    expect(allowed.allowed).toBe(true);
  });

  it('allows standard tier up to 1000/hr then queues', async () => {
    const key = 'sk_test_std';
    for (let i = 0; i < 1000; i++) {
      const r = await checkTieredRateLimit(key, 'standard');
      expect(r.allowed).toBe(true);
    }
    const blocked = await checkTieredRateLimit(key, 'standard');
    expect(blocked.allowed).toBe(false);
    expect(blocked.queued).toBe(true);
  });

  it('treats premium as unlimited', async () => {
    const key = 'sk_test_premium';
    for (let i = 0; i < 5000; i++) {
      const r = await checkTieredRateLimit(key, 'premium');
      expect(r.allowed).toBe(true);
      expect(r.limited).toBe(false);
    }
  });
});
