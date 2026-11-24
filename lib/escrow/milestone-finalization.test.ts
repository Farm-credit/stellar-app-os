import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  approveMilestoneWithGracePeriod,
  calculateVerifierRewardSplit,
  finalizeMilestonePayout,
  getMilestoneFinalization,
  markMilestoneDisputed,
  MilestoneFinalizationError,
  processDueMilestoneFinalizations,
  rejectMilestoneFinalization,
  resetMilestoneFinalizations,
} from './milestone-finalization';

const FARMER = 'GABEMKJNR4GK7M4FROGA7I7PG63N2CKE3EGDSBSISG56SVL2O3KRNDXA';
const VERIFIER = 'GBUQWP3BOUZX34TOND2QV7QQ7K7VJTG6VSE62MFPXXXIAGKZ6YTDCXI';

describe('calculateVerifierRewardSplit', () => {
  it('routes exactly 2% (200 bps) to verifier and 98% to farmer', () => {
    const split = calculateVerifierRewardSplit(750);
    expect(split.totalDisbursementUsdc).toBe(750);
    expect(split.verifierRewardUsdc).toBe(15);
    expect(split.farmerPayoutUsdc).toBe(735);
    expect(split.farmerPayoutStroops + split.verifierRewardStroops).toBe(split.totalStroops);
  });

  it('conserves exact total with integer stroop dust remainder kept by farmer', () => {
    // 0.0000101 USDC = 101 stroops -> 101 * 200 / 10_000 = 2 stroops verifier, 99 stroops farmer
    const split = calculateVerifierRewardSplit(0.0000101);
    expect(split.totalStroops).toBe(101n);
    expect(split.verifierRewardStroops).toBe(2n);
    expect(split.farmerPayoutStroops).toBe(99n);
    expect(split.farmerPayoutStroops + split.verifierRewardStroops).toBe(101n);

    // Sub-50 stroops yields 0 verifier reward and 100% to farmer
    const tiny = calculateVerifierRewardSplit(0.0000049);
    expect(tiny.totalStroops).toBe(49n);
    expect(tiny.verifierRewardStroops).toBe(0n);
    expect(tiny.farmerPayoutStroops).toBe(49n);
  });

  it('rejects non-positive or non-finite disbursement amounts', () => {
    expect(() => calculateVerifierRewardSplit(0)).toThrow(MilestoneFinalizationError);
    expect(() => calculateVerifierRewardSplit(-10)).toThrow(MilestoneFinalizationError);
    expect(() => calculateVerifierRewardSplit(Number.NaN)).toThrow(MilestoneFinalizationError);
  });
});

describe('milestone finalization lifecycle', () => {
  beforeEach(() => {
    resetMilestoneFinalizations();
  });

  it('pays out 98% to farmer and 2% to approving verifier after grace period expiry', async () => {
    const approvedAt = '2026-11-01T00:00:00.000Z';
    const gracePeriodEndsAt = '2026-11-08T00:00:00.000Z';
    const record = approveMilestoneWithGracePeriod({
      loanId: 'loan-1930',
      milestoneId: 1,
      farmerWalletAddress: FARMER,
      approvingVerifierAddress: VERIFIER,
      totalDisbursementUsdc: 1000,
      approvedAt,
      gracePeriodEndsAt,
    });

    expect(record.status).toBe('pending_grace');
    expect(record.split.verifierRewardUsdc).toBe(20);
    expect(record.split.farmerPayoutUsdc).toBe(980);

    const executePayout = vi.fn().mockResolvedValue({
      transactionHash: 'tx-finalize-1930',
      explorerUrl: 'https://stellar.expert/explorer/testnet/tx/tx-finalize-1930',
    });

    const finalized = await finalizeMilestonePayout('loan-1930', 1, {
      now: new Date('2026-11-08T00:00:00.000Z'),
      executePayout,
    });

    expect(executePayout).toHaveBeenCalledTimes(1);
    expect(finalized.status).toBe('finalized');
    expect(finalized.transactionHash).toBe('tx-finalize-1930');
    expect(finalized.split.verifierRewardUsdc).toBe(20);
    expect(finalized.split.farmerPayoutUsdc).toBe(980);
  });

  it('blocks finalization before grace period expires', async () => {
    approveMilestoneWithGracePeriod({
      loanId: 'loan-early',
      farmerWalletAddress: FARMER,
      approvingVerifierAddress: VERIFIER,
      totalDisbursementUsdc: 500,
      approvedAt: '2026-11-01T00:00:00.000Z',
      gracePeriodEndsAt: '2026-11-08T00:00:00.000Z',
    });

    const executePayout = vi.fn();
    await expect(
      finalizeMilestonePayout('loan-early', 1, {
        now: new Date('2026-11-07T23:59:59.000Z'),
        executePayout,
      })
    ).rejects.toMatchObject({ code: 'GRACE_PERIOD_ACTIVE' });
    expect(executePayout).not.toHaveBeenCalled();
  });

  it('blocks payout when milestone is disputed or rejected', async () => {
    approveMilestoneWithGracePeriod({
      loanId: 'loan-disputed',
      farmerWalletAddress: FARMER,
      approvingVerifierAddress: VERIFIER,
      totalDisbursementUsdc: 500,
      approvedAt: '2026-11-01T00:00:00.000Z',
      gracePeriodEndsAt: '2026-11-08T00:00:00.000Z',
    });
    markMilestoneDisputed('loan-disputed', 1, 'Buyer raised dispute');

    approveMilestoneWithGracePeriod({
      loanId: 'loan-rejected',
      farmerWalletAddress: FARMER,
      approvingVerifierAddress: VERIFIER,
      totalDisbursementUsdc: 500,
      approvedAt: '2026-11-01T00:00:00.000Z',
      gracePeriodEndsAt: '2026-11-08T00:00:00.000Z',
    });
    rejectMilestoneFinalization('loan-rejected', 1, 'Invalid GPS proof');

    const executePayout = vi.fn();
    await expect(
      finalizeMilestonePayout('loan-disputed', 1, {
        now: new Date('2026-11-09T00:00:00.000Z'),
        executePayout,
      })
    ).rejects.toMatchObject({ code: 'MILESTONE_DISPUTED' });

    await expect(
      finalizeMilestonePayout('loan-rejected', 1, {
        now: new Date('2026-11-09T00:00:00.000Z'),
        executePayout,
      })
    ).rejects.toMatchObject({ code: 'MILESTONE_REJECTED' });
    expect(executePayout).not.toHaveBeenCalled();
  });

  it('enforces idempotency and prevents double finalization', async () => {
    approveMilestoneWithGracePeriod({
      loanId: 'loan-idem',
      farmerWalletAddress: FARMER,
      approvingVerifierAddress: VERIFIER,
      totalDisbursementUsdc: 250,
      approvedAt: '2026-11-01T00:00:00.000Z',
      gracePeriodEndsAt: '2026-11-02T00:00:00.000Z',
    });

    const executePayout = vi.fn().mockResolvedValue({ transactionHash: 'tx-once' });
    await finalizeMilestonePayout('loan-idem', 1, {
      now: new Date('2026-11-03T00:00:00.000Z'),
      executePayout,
    });

    await expect(
      finalizeMilestonePayout('loan-idem', 1, {
        now: new Date('2026-11-04T00:00:00.000Z'),
        executePayout,
      })
    ).rejects.toMatchObject({ code: 'ALREADY_FINALIZED' });
    expect(executePayout).toHaveBeenCalledTimes(1);
  });

  it('rejects missing or empty approving verifier', () => {
    expect(() =>
      approveMilestoneWithGracePeriod({
        loanId: 'loan-no-verifier',
        farmerWalletAddress: FARMER,
        approvingVerifierAddress: '   ',
        totalDisbursementUsdc: 500,
      })
    ).toThrowError(expect.objectContaining({ code: 'INVALID_VERIFIER' }));
  });

  it('keeps pending_grace on transient payout error so retry succeeds', async () => {
    approveMilestoneWithGracePeriod({
      loanId: 'loan-retry',
      farmerWalletAddress: FARMER,
      approvingVerifierAddress: VERIFIER,
      totalDisbursementUsdc: 100,
      approvedAt: '2026-11-01T00:00:00.000Z',
      gracePeriodEndsAt: '2026-11-02T00:00:00.000Z',
    });

    await expect(
      finalizeMilestonePayout('loan-retry', 1, {
        now: new Date('2026-11-03T00:00:00.000Z'),
        executePayout: () => Promise.reject(new Error('Horizon timeout')),
      })
    ).rejects.toMatchObject({ code: 'PAYOUT_FAILED', message: 'Horizon timeout' });

    const snapshot = getMilestoneFinalization('loan-retry', 1);
    expect(snapshot?.status).toBe('pending_grace');
    expect(snapshot?.failureReason).toBe('Horizon timeout');

    const retried = await finalizeMilestonePayout('loan-retry', 1, {
      now: new Date('2026-11-03T00:05:00.000Z'),
      executePayout: () => Promise.resolve({ transactionHash: 'tx-recovered' }),
    });
    expect(retried.status).toBe('finalized');
    expect(retried.transactionHash).toBe('tx-recovered');
  });

  it('batch-processes only due pending_grace milestones', async () => {
    approveMilestoneWithGracePeriod({
      loanId: 'loan-due',
      farmerWalletAddress: FARMER,
      approvingVerifierAddress: VERIFIER,
      totalDisbursementUsdc: 400,
      approvedAt: '2026-11-01T00:00:00.000Z',
      gracePeriodEndsAt: '2026-11-05T00:00:00.000Z',
    });
    approveMilestoneWithGracePeriod({
      loanId: 'loan-future',
      farmerWalletAddress: FARMER,
      approvingVerifierAddress: VERIFIER,
      totalDisbursementUsdc: 400,
      approvedAt: '2026-11-01T00:00:00.000Z',
      gracePeriodEndsAt: '2026-11-10T00:00:00.000Z',
    });

    const processed = await processDueMilestoneFinalizations(new Date('2026-11-06T00:00:00.000Z'));
    expect(processed).toHaveLength(1);
    expect(processed[0].loanId).toBe('loan-due');
    expect(processed[0].status).toBe('finalized');
    expect(getMilestoneFinalization('loan-future', 1)?.status).toBe('pending_grace');
  });
});
