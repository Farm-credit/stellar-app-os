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

export interface QuotaConfig {
  perMinute: number;
  perDay: number;
}

export interface QuotaSnapshot {
  key: string;
  minuteUsed: number;
  minuteLimit: number;
  minuteReset: number;
  dayUsed: number;
  dayLimit: number;
  dayReset: number;
  allowed: boolean;
}

export interface RateLimitHeaders {
  'X-RateLimit-Limit': string;
  'X-RateLimit-Remaining': string;
  'X-RateLimit-Reset': string;
  'X-RateLimit-Quota-Limit': string;
  'X-RateLimit-Quota-Remaining': string;
  'X-RateLimit-Quota-Reset': string;
  'Retry-After'?: string;
}

const MINUTE_MS = 60000;
const DAY_MS = 86400000;

interface QuotaBucket {
  minuteStart: number;
  minuteCount: number;
  dayStart: number;
  dayCount: number;
}

export class QuotaStore {
  private buckets = new Map<string, QuotaBucket>();
  constructor(private defaults: QuotaConfig = { perMinute: 60, perDay: 10000 }) {}

  private bucket(key: string, now: number): QuotaBucket {
    let b = this.buckets.get(key);
    if (!b) {
      b = { minuteStart: now, minuteCount: 0, dayStart: now, dayCount: 0 };
      this.buckets.set(key, b);
    }
    if (now - b.minuteStart >= MINUTE_MS) {
      b.minuteStart = now;
      b.minuteCount = 0;
    }
    if (now - b.dayStart >= DAY_MS) {
      b.dayStart = now;
      b.dayCount = 0;
    }
    return b;
  }

  getQuota(key: string, cfg?: Partial<QuotaConfig>): QuotaSnapshot {
    const c = { ...this.defaults, ...cfg };
    const now = Date.now();
    const b = this.bucket(key, now);
    const minuteReset = b.minuteStart + MINUTE_MS;
    const dayReset = b.dayStart + DAY_MS;
    const allowed = b.minuteCount < c.perMinute && b.dayCount < c.perDay;
    return {
      key,
      minuteUsed: b.minuteCount,
      minuteLimit: c.perMinute,
      minuteReset,
      dayUsed: b.dayCount,
      dayLimit: c.perDay,
      dayReset,
      allowed,
    };
  }

  consume(key: string, cfg?: Partial<QuotaConfig>): QuotaSnapshot {
    const c = { ...this.defaults, ...cfg };
    const now = Date.now();
    const b = this.bucket(key, now);
    const allowed = b.minuteCount < c.perMinute && b.dayCount < c.perDay;
    if (allowed) {
      b.minuteCount += 1;
      b.dayCount += 1;
    }
    const minuteReset = b.minuteStart + MINUTE_MS;
    const dayReset = b.dayStart + DAY_MS;
    return {
      key,
      minuteUsed: b.minuteCount,
      minuteLimit: c.perMinute,
      minuteReset,
      dayUsed: b.dayCount,
      dayLimit: c.perDay,
      dayReset,
      allowed,
    };
  }

  toHeaders(snapshot: QuotaSnapshot): RateLimitHeaders {
    const now = Date.now();
    const minuteRemaining = Math.max(0, snapshot.minuteLimit - snapshot.minuteUsed);
    const dayRemaining = Math.max(0, snapshot.dayLimit - snapshot.dayUsed);
    const headers: RateLimitHeaders = {
      'X-RateLimit-Limit': String(snapshot.minuteLimit),
      'X-RateLimit-Remaining': String(minuteRemaining),
      'X-RateLimit-Reset': String(Math.ceil(snapshot.minuteReset / 1000)),
      'X-RateLimit-Quota-Limit': String(snapshot.dayLimit),
      'X-RateLimit-Quota-Remaining': String(dayRemaining),
      'X-RateLimit-Quota-Reset': String(Math.ceil(snapshot.dayReset / 1000)),
    };
    if (!snapshot.allowed) {
      const retryMs = Math.max(0, snapshot.minuteReset - now);
      headers['Retry-After'] = String(Math.ceil(retryMs / 1000));
    }
    return headers;
  }
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
    const ts = (this.hits.get(key) || []).filter((t) => t > now - c.windowMs);
    if (ts.length >= c.maxRequests) {
      const v = (this.violations.get(key) || 0) + 1;
      this.violations.set(key, v);
      const backoff = Math.min(
        (c.backoffBaseMs ?? 1000) * Math.pow(c.backoffFactor ?? 2, v - 1),
        c.maxBackoffMs ?? 3600000
      );
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

  check(
    key: string,
    limit = 120,
    windowMs = 60000
  ): { allowed: boolean; limit: number; remaining: number; resetAt: number } {
    const now = Date.now();
    const ts = (this.hits.get(key) || []).filter((t) => t > now - windowMs);
    if (ts.length >= limit) {
      return {
        allowed: false,
        limit,
        remaining: 0,
        resetAt: now + windowMs,
      };
    }
    ts.push(now);
    this.hits.set(key, ts);
    return {
      allowed: true,
      limit,
      remaining: Math.max(0, limit - ts.length),
      resetAt: now + windowMs,
    };
  }
}

