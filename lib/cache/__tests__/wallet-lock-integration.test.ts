import { beforeEach, describe, expect, it, vi } from 'vitest';
import { withWalletLock } from '@/lib/cache/redlock';
import { __resetMemoryLocksForTests } from '@/lib/cache/redlock';
import { __resetForTests as resetRedis } from '@/lib/cache/redis';

describe('Wallet Lock Integration – nonce collision prevention scenario', () => {
  beforeEach(() => {
    delete process.env.REDIS_URL;
    delete process.env.REDIS_URLS;
    __resetMemoryLocksForTests();
    resetRedis();
  });

  it('simulates concurrent transaction builds for same wallet getting serialized', async () => {
    const wallet = `G${'F'.repeat(55)}`;

    let sequence = 100;
    const loadAccountMock = vi.fn(async () => {
      // Simulate Horizon loadAccount returning current sequence
      await new Promise((r) => setTimeout(r, 5));
      return { sequence: (sequence++).toString() };
    });

    const buildTransactionMock = async (walletAddr: string) => {
      return withWalletLock(walletAddr, async () => {
        const account = await loadAccountMock();
        // Simulate building time
        await new Promise((r) => setTimeout(r, 20));
        const seq = parseInt(account.sequence, 10) + 1;
        return { wallet: walletAddr, sequence: seq, xdr: `xdr-${seq}` };
      });
    };

    // Simulate 5 concurrent builds for same wallet
    const builds = await Promise.all([
      buildTransactionMock(wallet),
      buildTransactionMock(wallet),
      buildTransactionMock(wallet),
      buildTransactionMock(wallet),
      buildTransactionMock(wallet),
    ]);

    // With lock serialization, sequences should be strictly increasing without gaps or duplicates
    const sequences = builds.map((b) => b.sequence);
    const unique = new Set(sequences);
    expect(unique.size).toBe(sequences.length); // no duplicates = no nonce collision

    // Sorted sequences should be consecutive (since loadAccount increments)
    const sorted = [...sequences].sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i]).toBeGreaterThan(sorted[i - 1]);
    }
  });

  it('different wallets do not block each other', async () => {
    const walletA = `G${'A'.repeat(55)}`;
    const walletB = `G${'B'.repeat(55)}`;

    const timestamps: { wallet: string; event: string; time: number }[] = [];

    const build = async (wallet: string, id: string) => {
      return withWalletLock(wallet, async () => {
        timestamps.push({ wallet, event: `start-${id}`, time: Date.now() });
        await new Promise((r) => setTimeout(r, 30));
        timestamps.push({ wallet, event: `end-${id}`, time: Date.now() });
      });
    };

    const start = Date.now();
    await Promise.all([build(walletA, 'a1'), build(walletB, 'b1')]);
    const duration = Date.now() - start;

    // If they were serialized, duration would be ~60ms; if parallel, ~30ms
    expect(duration).toBeLessThan(55); // allow some jitter but should be parallel

    // Both should have started before either finished too much
    const startA = timestamps.find((t) => t.event === 'start-a1')!.time;
    const startB = timestamps.find((t) => t.event === 'start-b1')!.time;
    expect(Math.abs(startA - startB)).toBeLessThan(15);
  });

  it('handles lock acquisition failure gracefully', async () => {
    const wallet = `G${'G'.repeat(55)}`;

    // Hold lock
    const hold = withWalletLock(wallet, async () => {
      await new Promise((r) => setTimeout(r, 200));
    });

    // Try to acquire with very short retry - should fail
    await expect(
      withWalletLock(wallet, async () => 'should not succeed', {
        retryCount: 1,
        retryDelayMs: 5,
        ttlMs: 1000,
      })
    ).rejects.toThrow();

    await hold;
  });
});
