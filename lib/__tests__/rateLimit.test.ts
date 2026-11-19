import { describe, it, expect, beforeEach, vi } from 'vitest';
import { checkRateLimit, checkSubmitAnonRateLimit, blockIp } from '../rateLimit';
import { redis } from '../redis';

// Mock the Redis module so it returns a mocked client if needed, or null to test fallback.
// Since rateLimit imports redis, we can mock it here if we want to test both paths.

describe('rateLimit', () => {
  beforeEach(() => {
    // Reset any mocked timers or states if needed
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('in-memory fallback (no redis)', () => {
    it('allows requests within limit', async () => {
      const ip = '192.168.1.1';
      const result = await checkRateLimit(ip, 2);
      expect(result.allowed).toBe(true);

      const result2 = await checkRateLimit(ip, 2);
      expect(result2.allowed).toBe(true);
    });

    it('blocks requests over limit', async () => {
      const ip = '192.168.1.2';
      await checkRateLimit(ip, 2);
      await checkRateLimit(ip, 2);
      const result = await checkRateLimit(ip, 2);
      
      expect(result.allowed).toBe(false);
      if (result.allowed === false) {
        expect(result.reason).toBe('rate_limit');
        expect(result.retryAfter).toBeGreaterThan(0);
      }
    });

    it('allows requests after window resets', async () => {
      const ip = '192.168.1.3';
      await checkRateLimit(ip, 1);
      const blocked = await checkRateLimit(ip, 1);
      expect(blocked.allowed).toBe(false);

      // Advance time by 61 seconds (window is 60s)
      vi.advanceTimersByTime(61000);

      const allowed = await checkRateLimit(ip, 1);
      expect(allowed.allowed).toBe(true);
    });

    it('blocks blocked IPs immediately', async () => {
      const ip = '10.0.0.1';
      blockIp(ip);
      const result = await checkRateLimit(ip);
      expect(result.allowed).toBe(false);
      if (result.allowed === false) {
        expect(result.reason).toBe('blocklist');
      }
    });
  });

  describe('checkSubmitAnonRateLimit (in-memory)', () => {
    it('allows up to 5 requests per hour', async () => {
      const ip = '192.168.2.1';
      
      for (let i = 0; i < 5; i++) {
        const result = await checkSubmitAnonRateLimit(ip);
        expect(result.allowed).toBe(true);
        if (result.allowed) {
          expect(result.remaining).toBe(5 - i - 1);
        }
      }

      const blocked = await checkSubmitAnonRateLimit(ip);
      expect(blocked.allowed).toBe(false);
      if (blocked.allowed === false) {
        expect(blocked.reason).toBe('rate_limit');
        expect(blocked.retryAfter).toBe(3600); // 1 hour in seconds
      }
    });
  });
});
