import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

import {
  initLockoutStore,
  createLockoutStore,
  InMemoryLockoutStore,
  RedisLockoutStore,
  type TwoFactorService,
} from './TwoFactorLockoutInit';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTwoFactorService(): TwoFactorService {
  return { lockoutStore: null };
}

/** Minimal Redis client stub – mirrors the shape required by RedisLockoutStore. */
function makeRedisClient() {
  const data: Record<string, string> = {};
  const locks: Record<string, boolean> = {};

  return {
    incr: vi.fn((key: string) => {
      const next = (parseInt(data[key] ?? '0', 10) || 0) + 1;
      data[key] = String(next);
      return Promise.resolve(next);
    }),
    get: vi.fn((key: string) => Promise.resolve(data[key] ?? null)),
    del: vi.fn((key: string) => {
      const existed = key in data || key in locks;
      delete data[key];
      delete locks[key];
      return Promise.resolve(existed ? 1 : 0);
    }),
    set: vi.fn((key: string, _value: string, _opts: { PX: number }) => {
      locks[key] = true;
      return Promise.resolve('OK' as string | null);
    }),
    exists: vi.fn((key: string) => Promise.resolve(locks[key] ? 1 : 0)),
  };
}

// ---------------------------------------------------------------------------
// initLockoutStore
// ---------------------------------------------------------------------------

describe('initLockoutStore', () => {
  it('registers a lockout store on twoFactorService after init', () => {
    const service = makeTwoFactorService();
    expect(service.lockoutStore).toBeNull();

    initLockoutStore(service);

    expect(service.lockoutStore).not.toBeNull();
  });

  it('replaces any previously registered store when called again', () => {
    const service = makeTwoFactorService();
    initLockoutStore(service);
    const first = service.lockoutStore;

    initLockoutStore(service);
    const second = service.lockoutStore;

    // Both should be valid stores but they are distinct instances.
    expect(second).not.toBeNull();
    expect(second).not.toBe(first);
  });

  describe('environment-based store selection', () => {
    const originalEnv = process.env.NODE_ENV;

    const setNodeEnv = (value: string) => {
      Object.defineProperty(process.env, 'NODE_ENV', {
        value,
        configurable: true,
      });
    };

    afterEach(() => {
      setNodeEnv(originalEnv);
    });

    it('uses InMemoryLockoutStore in test environment (no Redis client)', () => {
      setNodeEnv('test');
      const service = makeTwoFactorService();

      initLockoutStore(service);

      expect(service.lockoutStore).toBeInstanceOf(InMemoryLockoutStore);
    });

    it('uses InMemoryLockoutStore in test environment even when Redis client is provided', () => {
      setNodeEnv('test');
      const service = makeTwoFactorService();

      // In test mode the factory always returns InMemoryLockoutStore.
      initLockoutStore(service, makeRedisClient());

      expect(service.lockoutStore).toBeInstanceOf(InMemoryLockoutStore);
    });

    it('uses RedisLockoutStore in non-test environment when Redis client is provided', () => {
      setNodeEnv('production');
      const service = makeTwoFactorService();

      initLockoutStore(service, makeRedisClient());

      expect(service.lockoutStore).toBeInstanceOf(RedisLockoutStore);
    });

    it('falls back to InMemoryLockoutStore in non-test environment when no Redis client is provided', () => {
      setNodeEnv('production');
      const service = makeTwoFactorService();

      initLockoutStore(service, null);

      expect(service.lockoutStore).toBeInstanceOf(InMemoryLockoutStore);
    });
  });
});

// ---------------------------------------------------------------------------
// createLockoutStore (factory)
// ---------------------------------------------------------------------------

describe('createLockoutStore', () => {
  const originalEnv = process.env.NODE_ENV;
  const setNodeEnv = (value: string) => {
    Object.defineProperty(process.env, 'NODE_ENV', {
      value,
      configurable: true,
    });
  };

  afterEach(() => {
    setNodeEnv(originalEnv);
  });

  it('returns InMemoryLockoutStore when NODE_ENV is test', () => {
    setNodeEnv('test');
    const store = createLockoutStore();
    expect(store).toBeInstanceOf(InMemoryLockoutStore);
  });

  it('returns InMemoryLockoutStore when no Redis client is passed (any env)', () => {
    setNodeEnv('production');
    const store = createLockoutStore(null);
    expect(store).toBeInstanceOf(InMemoryLockoutStore);
  });

  it('returns RedisLockoutStore when a Redis client is provided in non-test env', () => {
    setNodeEnv('production');
    const store = createLockoutStore(makeRedisClient());
    expect(store).toBeInstanceOf(RedisLockoutStore);
  });
});

// ---------------------------------------------------------------------------
// InMemoryLockoutStore
// ---------------------------------------------------------------------------

describe('InMemoryLockoutStore', () => {
  let store: InMemoryLockoutStore;

  beforeEach(() => {
    store = new InMemoryLockoutStore();
  });

  describe('incrementFailures', () => {
    it('starts at 0 and increments correctly', async () => {
      expect(await store.incrementFailures('user-1')).toBe(1);
      expect(await store.incrementFailures('user-1')).toBe(2);
      expect(await store.incrementFailures('user-1')).toBe(3);
    });

    it('tracks failures independently per user', async () => {
      await store.incrementFailures('alice');
      await store.incrementFailures('alice');
      await store.incrementFailures('bob');

      expect(await store.getFailureCount('alice')).toBe(2);
      expect(await store.getFailureCount('bob')).toBe(1);
    });
  });

  describe('getFailureCount', () => {
    it('returns 0 for unknown users', async () => {
      expect(await store.getFailureCount('no-such-user')).toBe(0);
    });

    it('returns the current count after increments', async () => {
      await store.incrementFailures('user-2');
      await store.incrementFailures('user-2');
      expect(await store.getFailureCount('user-2')).toBe(2);
    });
  });

  describe('resetFailures', () => {
    it('resets failure count to 0', async () => {
      await store.incrementFailures('user-3');
      await store.incrementFailures('user-3');
      await store.resetFailures('user-3');
      expect(await store.getFailureCount('user-3')).toBe(0);
    });

    it('clears any active lockout', async () => {
      await store.lockOut('user-3', 60_000);
      expect(await store.isLockedOut('user-3')).toBe(true);
      await store.resetFailures('user-3');
      expect(await store.isLockedOut('user-3')).toBe(false);
    });

    it('is idempotent when called on a user with no failures', async () => {
      await expect(store.resetFailures('ghost-user')).resolves.not.toThrow();
      expect(await store.getFailureCount('ghost-user')).toBe(0);
    });
  });

  describe('lockOut / isLockedOut', () => {
    it('marks a user as locked out for the specified duration', async () => {
      await store.lockOut('user-4', 60_000);
      expect(await store.isLockedOut('user-4')).toBe(true);
    });

    it('returns false for users who have never been locked out', async () => {
      expect(await store.isLockedOut('clean-user')).toBe(false);
    });

    it('returns false after the lockout window expires', async () => {
      vi.useFakeTimers();

      await store.lockOut('user-5', 1_000);
      expect(await store.isLockedOut('user-5')).toBe(true);

      vi.advanceTimersByTime(1_500);
      expect(await store.isLockedOut('user-5')).toBe(false);

      vi.useRealTimers();
    });
  });
});

// ---------------------------------------------------------------------------
// RedisLockoutStore
// ---------------------------------------------------------------------------

describe('RedisLockoutStore', () => {
  let redis: ReturnType<typeof makeRedisClient>;
  let store: RedisLockoutStore;

  beforeEach(() => {
    redis = makeRedisClient();
    store = new RedisLockoutStore(redis);
  });

  describe('incrementFailures', () => {
    it('delegates to redis.incr and returns the incremented value', async () => {
      const count = await store.incrementFailures('u1');
      expect(count).toBe(1);
      expect(redis.incr).toHaveBeenCalledWith('lockout:failures:u1');
    });

    it('increments correctly across multiple calls', async () => {
      expect(await store.incrementFailures('u2')).toBe(1);
      expect(await store.incrementFailures('u2')).toBe(2);
    });
  });

  describe('getFailureCount', () => {
    it('returns 0 for a key that has never been set', async () => {
      expect(await store.getFailureCount('unknown')).toBe(0);
      expect(redis.get).toHaveBeenCalledWith('lockout:failures:unknown');
    });

    it('returns the stored count', async () => {
      await store.incrementFailures('u3');
      await store.incrementFailures('u3');
      expect(await store.getFailureCount('u3')).toBe(2);
    });
  });

  describe('resetFailures', () => {
    it('calls redis.del for both failure and lock keys', async () => {
      await store.resetFailures('u4');
      expect(redis.del).toHaveBeenCalledWith('lockout:failures:u4');
      expect(redis.del).toHaveBeenCalledWith('lockout:locked:u4');
    });
  });

  describe('isLockedOut', () => {
    it('returns false when no lock key exists', async () => {
      expect(await store.isLockedOut('u5')).toBe(false);
      expect(redis.exists).toHaveBeenCalledWith('lockout:locked:u5');
    });

    it('returns true after lockOut is called', async () => {
      await store.lockOut('u5', 60_000);
      expect(await store.isLockedOut('u5')).toBe(true);
    });
  });

  describe('lockOut', () => {
    it('calls redis.set with the correct key and PX option', async () => {
      await store.lockOut('u6', 30_000);
      expect(redis.set).toHaveBeenCalledWith('lockout:locked:u6', '1', { PX: 30_000 });
    });
  });

  describe('custom keyPrefix', () => {
    it('uses the provided prefix for all keys', async () => {
      const customStore = new RedisLockoutStore(redis, '2fa:');
      await customStore.incrementFailures('u7');
      expect(redis.incr).toHaveBeenCalledWith('2fa:failures:u7');
    });
  });
});
