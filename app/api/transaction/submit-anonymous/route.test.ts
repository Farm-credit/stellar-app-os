import { beforeEach, describe, expect, it, vi } from 'vitest';

const { checkSubmitAnonRateLimit } = vi.hoisted(() => ({
  checkSubmitAnonRateLimit: vi.fn(),
}));

vi.mock('@/lib/rateLimit', () => ({
  checkSubmitAnonRateLimit,
}));
vi.mock('@/lib/stellar/transaction', () => ({
  submitTransaction: vi.fn(),
}));
vi.mock('@/lib/zk/prover', () => ({
  verifyAnonymousDonationProof: vi.fn(),
}));
vi.mock('@/lib/stellar/anonymous-donation', () => ({
  isNullifierUsed: vi.fn(),
}));

import { POST } from './route';

describe('POST /api/transaction/submit-anonymous', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 429 with rate-limit headers when the submission limit is exceeded', async () => {
    checkSubmitAnonRateLimit.mockResolvedValue({
      allowed: false,
      reason: 'rate_limit',
      retryAfter: 123,
      remaining: 0,
      reset: 1_900_000_000_000,
    });

    const request = new Request('http://localhost/api/transaction/submit-anonymous', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': '203.0.113.42',
      },
      body: '{invalid json',
    });

    const response = await POST(request);

    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('123');
    expect(response.headers.get('X-RateLimit-Limit')).toBe('5');
    expect(response.headers.get('X-RateLimit-Remaining')).toBe('0');
    expect(response.headers.get('X-RateLimit-Reset')).toBe('1900000000');
    await expect(response.json()).resolves.toEqual({
      error: 'Too many anonymous submissions. Please try again later.',
    });
    expect(checkSubmitAnonRateLimit).toHaveBeenCalledWith('203.0.113.42');
  });
});
