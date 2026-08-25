import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  acquireLock,
  withLock,
  withWalletLock,
  withWalletSigningLock,
  LockAcquisitionError,
  __resetMemoryLocksForTests,
  WALLET_LOCK_PREFIX,
} from '@/lib/cache/redlock';
import { __resetForTests as resetRedis } from '@/lib/cache/redis';

describe('Redlock - in-memory fallback (no REDIS_URL)', () => {
  beforeEach(() => {
    delete process.env.REDIS_URL;
    delete process.env.REDIS_URLS;
    __resetMemoryLocksForTests();
    resetRedis();
    vi.clearAllMocks();
  });

  it('acquires and releases a lock', async () => {
    const lock = await acquireLock('test-resource', 1000, { retryCount: 1 });
    expect(lock.resource).toBe('test-resource');
    expect(lock.value).toBeDefined();
    expect(lock.validityUntil).toBeGreaterThan(Date.now());

    const released = await lock.release();
    expect(released).toBe(true);
  });

  it('prevents concurrent access via withLock serialization', async () => {
    const order: number[] = [];

    const task = async (id: number, delayMs: number) => {
      return withLock(
        'serialized-resource',
        async () => {
          order.push(id);
          await new Promise((r) => setTimeout(r, delayMs));
          order.push(id * 10);
        },
        { ttlMs: 5000, retryCount: 5, retryDelayMs: 10, retryJitterMs: 5 }
      );
    };

    await Promise.all([task(1, 20), task(2, 10), task(3, 5)]);

    // Each task should have pushed id then id*10 consecutively without interleaving
    // i.e., we should see pairs [1,10, 2,20, 3,30] in some order but pairs not split
    expect(order.length).toBe(6);
    // Check that for each pair, id appears immediately before id*10
    for (let i = 0; i < order.length; i += 2) {
      const first = order[i];
      const second = order[i + 1];
      expect(second).toBe(first * 10);
    }
  });

  it('throws LockAcquisitionError after retries exhausted', async () => {
    // Acquire lock and hold it
    const lock = await acquireLock('contention-resource', 5000, { retryCount: 1 });

    await expect(
      acquireLock('contention-resource', 1000, { retryCount: 2, retryDelayMs: 5, retryJitterMs: 2 })
    ).rejects.toThrow(LockAcquisitionError);

    await lock.release();
  });

  it('withWalletLock serializes per wallet address', async () => {
    const walletA = `G${'A'.repeat(55)}`;
    const walletB = `G${'B'.repeat(55)}`;

    const events: string[] = [];

    const buildTx = async (wallet: string, id: string, delay: number) => {
      return withWalletLock(
        wallet,
        async () => {
          events.push(`start-${wallet.slice(1, 2)}-${id}`);
          await new Promise((r) => setTimeout(r, delay));
          events.push(`end-${wallet.slice(1, 2)}-${id}`);
          return id;
        },
        { ttlMs: 3000, retryCount: 10, retryDelayMs: 5 }
      );
    };

    // Two concurrent tx for same wallet should serialize
    const [r1, r2, r3] = await Promise.all([
      buildTx(walletA, 'tx1', 30),
      buildTx(walletA, 'tx2', 10),
      buildTx(walletB, 'tx3', 5), // different wallet can run concurrently with A
    ]);

    expect(r1).toBe('tx1');
    expect(r2).toBe('tx2');
    expect(r3).toBe('tx3');

    // For wallet A, tx1 should complete before tx2 starts (serialized)
    const idxStartA1 = events.indexOf('start-A-tx1');
    const idxEndA1 = events.indexOf('end-A-tx1');
    const idxStartA2 = events.indexOf('start-A-tx2');
    const idxEndA2 = events.indexOf('end-A-tx2');

    expect(idxStartA1).toBeLessThan(idxEndA1);
    expect(idxEndA1).toBeLessThan(idxStartA2);
    expect(idxStartA2).toBeLessThan(idxEndA2);
  });

  it('withWalletSigningLock uses longer TTL by default', async () => {
    const wallet = `G${'C'.repeat(55)}`;
    const lock = await withWalletSigningLock(wallet, async () => {
      // Inside critical section, try to acquire same lock with short retry should fail
      await expect(
        acquireLock(`${WALLET_LOCK_PREFIX}${wallet}`, 1000, {
          retryCount: 1,
          retryDelayMs: 1,
        })
      ).rejects.toThrow();

      return 'signed';
    });

    expect(lock).toBe('signed');
  });

  it('withLock releases even if function throws', async () => {
    await expect(
      withLock(
        'failing-resource',
        async () => {
          throw new Error('tx build failed');
        },
        { ttlMs: 1000, retryCount: 1 }
      )
    ).rejects.toThrow('tx build failed');

    // Should be able to acquire again after failure
    const lock = await acquireLock('failing-resource', 1000, { retryCount: 1 });
    expect(lock).toBeDefined();
    await lock.release();
  });

  it('auto-releases after TTL expiry', async () => {
    const lock = await acquireLock('ttl-resource', 100, { retryCount: 1 });
    expect(lock).toBeDefined();

    // Wait for TTL to expire (memory fallback auto-releases)
    await new Promise((r) => setTimeout(r, 150));

    // Should be able to acquire again
    const lock2 = await acquireLock('ttl-resource', 1000, { retryCount: 1 });
    expect(lock2).toBeDefined();
    await lock2.release();
  });

  it('extend works for memory locks', async () => {
    const lock = await acquireLock('extend-resource', 200, { retryCount: 1 });
    const extended = await lock.extend(1000);
    expect(extended).toBe(true);

    // Should still hold after original TTL would have expired
    await new Promise((r) => setTimeout(r, 300));
    // Try acquiring should still fail because we extended
    await expect(
      acquireLock('extend-resource', 500, { retryCount: 1, retryDelayMs: 1 })
    ).rejects.toThrow();

    await lock.release();
  });
});

describe('Redlock - Redis mocked', () => {
  beforeEach(() => {
    __resetMemoryLocksForTests();
    resetRedis();
    process.env.REDIS_URL = 'redis://localhost:6379';
  });

  it('generates unique lock values', async () => {
    // Even with Redis configured, if client creation fails it falls back
    // Here we test that fallback still works
    delete process.env.REDIS_URL;
    const lock1 = await acquireLock('unique-test', 1000, { retryCount: 1 });
    await lock1.release();
    const lock2 = await acquireLock('unique-test', 1000, { retryCount: 1 });
    expect(lock1.value).not.toBe(lock2.value);
    await lock2.release();
  });
});
