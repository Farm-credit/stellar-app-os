export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  backoffBaseMs?: number;
  backoffFactor?: number;
  maxBackoffMs?: number;
}

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
  retryAfter?: number;
}

export class MemoryRateLimiter {
  private hits = new Map<string, number[]>();
  private blocks = new Map<string, number>();
  private violations = new Map<string, number>();
  constructor(private defaults: Partial<RateLimitConfig> = {}) {}

  async limit(key: string, cfg?: Partial<RateLimitConfig>): Promise<RateLimitResult> {
    const c = {
      windowMs: 60000,
      maxRequests: 100,
      backoffBaseMs: 1000,
      backoffFactor: 2,
      maxBackoffMs: 3600000,
      ...this.defaults,
      ...cfg,
    };
    const now = Date.now();
    const blocked = this.blocks.get(key);
    if (blocked && blocked > now) {
      return {
        success: false,
        limit: c.maxRequests,
        remaining: 0,
        reset: blocked,
        retryAfter: Math.ceil((blocked - now) / 1000),
      };
    }
    let ts = (this.hits.get(key) || []).filter((t) => t > now - c.windowMs);
    if (ts.length >= c.maxRequests) {
      const v = (this.violations.get(key) || 0) + 1;
      this.violations.set(key, v);
      const backoff = Math.min(c.backoffBaseMc * Math.pow(c.backoffFactor, v - 1), c.maxBackoffMc);
      const until = now + backoff;
      this.blocks.set(key, until);
      return {
        success: false,
        limit: c.maxRequests,
        remaining: 0,
        reset: until,
        retryAfter: Math.ceil(backoff / 1000),
      };
    }
    this.blocks.delete(key);
    this.violations.delete(key);
    ts.push(now);
    this.hits.set(key, ts);
    return {
      success: true,
      limit: c.maxRequests,
      remaining: c.maxRequests - ts.length,
      reset: now + c.windowMs,
    };
  }
}
