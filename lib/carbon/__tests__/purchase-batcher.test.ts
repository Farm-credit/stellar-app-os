import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  estimateBatchFees,
  estimateIndividualFees,
  computeSavingsPct,
  PurchaseBatcher,
  processBatchResult,
  type BatchablePurchase,
  type PurchaseBatch,
} from '../purchase-batcher';
import {
  canonicalJson,
  sha256Hex,
  buildRetirementReceipt,
  buildRetirementMemo,
  verifyRetirementReceipt,
} from '../retirement-proof';

function makePurchase(i: number, asset = 'USDC:issuer1'): BatchablePurchase {
  return {
    purchaseId: `p_${i}`,
    buyerWallet: 'G'.repeat(56),
    projectId: 'proj-1',
    quantity: 10,
    amountStroops: 1_000_000,
    asset,
  };
}

describe('batch fee math (#1328)', () => {
  it('individual fees scale linearly with count', () => {
    expect(estimateIndividualFees(1)).toBe(3_700);
    expect(estimateIndividualFees(10)).toBe(37_000);
  });

  it('batched fees amortize the base fee across ops', () => {
    expect(estimateBatchFees(1)).toBe(3_700);
    expect(estimateBatchFees(10)).toBe(4_600);
  });

  it('savings approach 80%+ for realistic batch sizes', () => {
    // individual: n × 3_700; batched: 3_600 + n × 100 → 78% at 5, 88% at 10
    expect(computeSavingsPct(5)).toBe(78);
    expect(computeSavingsPct(10)).toBe(88);
    expect(computeSavingsPct(50)).toBe(95);
  });
});

describe('PurchaseBatcher', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('coalesces same-asset purchases into one batch', async () => {
    const onFlush = vi.fn(async (batch: PurchaseBatch) => {
      await Promise.resolve();
      return processBatchResult(batch, 'x');
    });
    const batcher = new PurchaseBatcher({ windowMs: 1_000, onFlush });

    await batcher.add(makePurchase(1));
    await batcher.add(makePurchase(2));
    expect(batcher.pendingCount('USDC:issuer1')).toBe(2);

    await vi.advanceTimersByTimeAsync(1_100);
    expect(onFlush).toHaveBeenCalledTimes(1);
    const batch = onFlush.mock.calls[0][0] as PurchaseBatch;
    expect(batch.purchases).toHaveLength(2);
    expect(batch.totalQuantity).toBe(20);
    expect(batch.totalAmountStroops).toBe(2_000_000);
  });

  it('separates batches per asset', async () => {
    const onFlush = vi.fn(async (batch: PurchaseBatch) => {
      await Promise.resolve();
      return processBatchResult(batch, 'x');
    });
    const batcher = new PurchaseBatcher({ windowMs: 1_000, onFlush });

    await batcher.add(makePurchase(1, 'USDC:A'));
    await batcher.add(makePurchase(2, 'USDC:B'));
    await vi.advanceTimersByTimeAsync(1_100);
    expect(onFlush).toHaveBeenCalledTimes(2);
  });

  it('flushes immediately when maxBatchSize reached', async () => {
    const onFlush = vi.fn(async (batch: PurchaseBatch) => {
      await Promise.resolve();
      return processBatchResult(batch, 'x');
    });
    const batcher = new PurchaseBatcher({ windowMs: 60_000, maxBatchSize: 2, onFlush });

    await batcher.add(makePurchase(1));
    await batcher.add(makePurchase(2));
    expect(onFlush).toHaveBeenCalledTimes(1);
  });

  it('flushes a batch at most once (reentrancy guard)', async () => {
    const onFlush = vi.fn(async (batch: PurchaseBatch) => {
      await Promise.resolve();
      return processBatchResult(batch, 'x');
    });
    const batcher = new PurchaseBatcher({ windowMs: 1_000, onFlush });

    await batcher.add(makePurchase(1));
    const first = await batcher.flush('USDC:issuer1');
    const second = await batcher.flush('USDC:issuer1');
    expect(first).not.toBeNull();
    expect(second).toBeNull();
    expect(onFlush).toHaveBeenCalledTimes(1);
  });
});

describe('processBatchResult', () => {
  it('reports per-purchase status and savings', () => {
    const batch: PurchaseBatch = {
      batchId: 'b1',
      asset: 'USDC:X',
      createdAt: 0,
      totalQuantity: 30,
      totalAmountStroops: 3_000_000,
      purchases: [makePurchase(1), makePurchase(2), makePurchase(3)],
    };
    const result = processBatchResult(batch, 'tx_123', new Set(['p_2']));
    expect(result.txHash).toBe('tx_123');
    expect(result.results.find((r) => r.purchaseId === 'p_2')?.status).toBe('failed');
    expect(result.results.filter((r) => r.status === 'submitted')).toHaveLength(2);
    expect(result.savingsPct).toBe(computeSavingsPct(3));
  });
});

describe('retirement receipt hashing (#1330)', () => {
  it('canonicalJson sorts keys deterministically', () => {
    const a = canonicalJson({ b: 1, a: { d: 2, c: [3, { f: 4, e: 5 }] } });
    const b = canonicalJson({ a: { c: [3, { e: 5, f: 4 }], d: 2 }, b: 1 });
    expect(a).toBe(b);
    expect(a).toBe('{"a":{"c":[3,{"e":5,"f":4}],"d":2},"b":1}');
  });

  it('builds a receipt with a stable sha256 digest', () => {
    const input = {
      retirementKey: 'ret_abc12345',
      buyerWallet: 'G'.repeat(56),
      creditAmount: 25,
      projectId: 'proj-9',
      projectName: 'Northern Nigeria Reforestation',
      coBenefits: ['biodiversity', 'rural_jobs'],
      network: 'testnet' as const,
      txHash: 'a'.repeat(64),
    };
    const receipt = buildRetirementReceipt(input);
    expect(receipt.receiptHash).toMatch(/^[0-9a-f]{64}$/);
    // Recompute: hash of the body (with the digest field blanked) must equal
    // the stored digest — but buildRetirementReceipt hashes the body *without*
    // the receiptHash key, so replicate that exactly.
    const body = { ...receipt } as Record<string, unknown>;
    delete body.receiptHash;
    expect(sha256Hex(canonicalJson(body))).toBe(receipt.receiptHash);
  });

  it('detects tampering via verifyRetirementReceipt', () => {
    const receipt = buildRetirementReceipt({
      retirementKey: 'ret_abc12345',
      buyerWallet: 'G'.repeat(56),
      creditAmount: 25,
      projectId: 'proj-9',
      projectName: 'Test Project',
      coBenefits: [],
      network: 'testnet',
      txHash: 'b'.repeat(64),
    });

    const clean = verifyRetirementReceipt(receipt);
    expect(clean.valid).toBe(true);

    const tampered = { ...receipt, creditAmount: 999 };
    expect(verifyRetirementReceipt(tampered).valid).toBe(false);
  });

  it('builds a 28-char max on-chain memo', () => {
    const receipt = buildRetirementReceipt({
      retirementKey: 'ret_abc12345',
      buyerWallet: 'G'.repeat(56),
      creditAmount: 1,
      projectId: 'p',
      projectName: 'p',
      coBenefits: [],
      network: 'testnet',
      txHash: 'c'.repeat(64),
    });
    const memo = buildRetirementMemo(receipt.receiptHash);
    expect(memo.length).toBeLessThanOrEqual(28);
    expect(memo.startsWith('ret:')).toBe(true);
  });
});
