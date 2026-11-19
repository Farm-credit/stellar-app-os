/**
 * TwoFactorLockoutInit
 *
 * Wires the pluggable lockout store into twoFactorService at startup.
 * In non-test environments the Redis-backed store is used; in test environments
 * an in-memory store is substituted to avoid external dependencies.
 */

export interface LockoutStore {
  /** Increment the failure count for a user and return the new count. */
  incrementFailures(userId: string): Promise<number>;
  /** Return the current failure count for a user. */
  getFailureCount(userId: string): Promise<number>;
  /** Reset the failure count for a user to zero. */
  resetFailures(userId: string): Promise<void>;
  /** Return true when the user is currently locked out. */
  isLockedOut(userId: string): Promise<boolean>;
  /** Lock a user out for the given duration (milliseconds). */
  lockOut(userId: string, durationMs: number): Promise<void>;
}

export interface TwoFactorService {
  lockoutStore: LockoutStore | null;
}

/**
 * In-memory lockout store used during tests to avoid Redis dependency.
 */
export class InMemoryLockoutStore implements LockoutStore {
  private failures: Map<string, number> = new Map();
  private lockouts: Map<string, number> = new Map(); // userId → expiry timestamp

  async incrementFailures(userId: string): Promise<number> {
    const current = this.failures.get(userId) ?? 0;
    const next = current + 1;
    this.failures.set(userId, next);
    return next;
  }

  async getFailureCount(userId: string): Promise<number> {
    return this.failures.get(userId) ?? 0;
  }

  async resetFailures(userId: string): Promise<void> {
    this.failures.delete(userId);
    this.lockouts.delete(userId);
  }

  async isLockedOut(userId: string): Promise<boolean> {
    const expiry = this.lockouts.get(userId);
    if (expiry === undefined) return false;
    if (Date.now() < expiry) return true;
    this.lockouts.delete(userId);
    return false;
  }

  async lockOut(userId: string, durationMs: number): Promise<void> {
    this.lockouts.set(userId, Date.now() + durationMs);
  }
}

/**
 * Redis-backed lockout store for production use.
 *
 * Uses redis TTL for automatic expiry of lockout windows.
 * A real implementation would inject the Redis client; this stub mirrors
 * the interface so the wiring logic in `initLockoutStore` can be tested
 * without a live Redis connection.
 */
export class RedisLockoutStore implements LockoutStore {
  private readonly keyPrefix: string;
  private readonly redisClient: {
    incr: (key: string) => Promise<number>;
    get: (key: string) => Promise<string | null>;
    del: (key: string) => Promise<number>;
    set: (key: string, value: string, options: { PX: number }) => Promise<string | null>;
    exists: (key: string) => Promise<number>;
  };

  constructor(
    redisClient: RedisLockoutStore['redisClient'],
    keyPrefix = 'lockout:'
  ) {
    this.redisClient = redisClient;
    this.keyPrefix = keyPrefix;
  }

  private failureKey(userId: string) {
    return `${this.keyPrefix}failures:${userId}`;
  }

  private lockKey(userId: string) {
    return `${this.keyPrefix}locked:${userId}`;
  }

  async incrementFailures(userId: string): Promise<number> {
    return this.redisClient.incr(this.failureKey(userId));
  }

  async getFailureCount(userId: string): Promise<number> {
    const val = await this.redisClient.get(this.failureKey(userId));
    return val ? parseInt(val, 10) : 0;
  }

  async resetFailures(userId: string): Promise<void> {
    await this.redisClient.del(this.failureKey(userId));
    await this.redisClient.del(this.lockKey(userId));
  }

  async isLockedOut(userId: string): Promise<boolean> {
    const exists = await this.redisClient.exists(this.lockKey(userId));
    return exists === 1;
  }

  async lockOut(userId: string, durationMs: number): Promise<void> {
    await this.redisClient.set(this.lockKey(userId), '1', { PX: durationMs });
  }
}

/**
 * Factory that returns the appropriate store based on the current environment.
 *
 * @param redisClient - Optional Redis client; required in non-test environments.
 */
export function createLockoutStore(
  redisClient?: RedisLockoutStore['redisClient'] | null
): LockoutStore {
  const isTest = process.env.NODE_ENV === 'test';
  if (isTest || !redisClient) {
    return new InMemoryLockoutStore();
  }
  return new RedisLockoutStore(redisClient);
}

/**
 * Initialises the lockout store on `twoFactorService` at application startup.
 *
 * Call this once during app bootstrap, before any authentication handlers run.
 *
 * @param twoFactorService - The mutable service object that owns the store reference.
 * @param redisClient - Optional Redis client passed in so callers control the connection.
 */
export function initLockoutStore(
  twoFactorService: TwoFactorService,
  redisClient?: RedisLockoutStore['redisClient'] | null
): void {
  const store = createLockoutStore(redisClient);
  twoFactorService.lockoutStore = store;
}
