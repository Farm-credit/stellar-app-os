import { beforeEach, describe, expect, it, vi } from 'vitest';

const { executeMilestoneFinalizationOnStellarMock, emitMilestonePayoutApprovedMock } = vi.hoisted(
  () => ({
    executeMilestoneFinalizationOnStellarMock: vi.fn(),
    emitMilestonePayoutApprovedMock: vi.fn(),
  })
);

vi.mock('@/lib/stellar/escrow', () => ({
  executeMilestoneFinalizationOnStellar: executeMilestoneFinalizationOnStellarMock,
}));

vi.mock('@/lib/webhook/events', () => ({
  emitMilestonePayoutApproved: emitMilestonePayoutApprovedMock,
}));

import { resetMilestoneFinalizations } from '@/lib/escrow/milestone-finalization';
import { GET, POST } from './route';

describe('/api/escrow/finalize', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMilestoneFinalizations();
    executeMilestoneFinalizationOnStellarMock.mockResolvedValue({
      transactionHash: 'tx-stellar-1930',
      explorerUrl: 'https://stellar.expert/explorer/testnet/tx/tx-stellar-1930',
    });
  });

  it('approves a milestone, blocks pre-expiry, finalizes after grace expiry with 2% split, and rejects double finalize', async () => {
    const approveRes = await POST(
      new Request('http://localhost/api/escrow/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'approve',
          loanId: 'loan-api-1',
          milestoneId: 1,
          farmerWalletAddress: 'GFARMERAPI',
          approvingVerifierAddress: 'GVERIFIERAPI',
          totalDisbursementUsdc: 750,
          escrowSecretKey: 'SESCROWSECRET',
          approvedAt: '2026-11-01T00:00:00.000Z',
          gracePeriodEndsAt: '2026-11-08T00:00:00.000Z',
        }),
      })
    );

    expect(approveRes.status).toBe(201);
    const approveData = await approveRes.json();
    expect(approveData.finalization.status).toBe('pending_grace');
    expect(approveData.finalization.split.verifierRewardUsdc).toBe(15);
    expect(approveData.finalization.split.farmerPayoutUsdc).toBe(735);

    const earlyRes = await POST(
      new Request('http://localhost/api/escrow/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'finalize',
          loanId: 'loan-api-1',
          milestoneId: 1,
          asOf: '2026-11-07T00:00:00.000Z',
        }),
      })
    );
    expect(earlyRes.status).toBe(409);
    const earlyData = await earlyRes.json();
    expect(earlyData.code).toBe('GRACE_PERIOD_ACTIVE');
    expect(executeMilestoneFinalizationOnStellarMock).not.toHaveBeenCalled();

    const finalizeRes = await POST(
      new Request('http://localhost/api/escrow/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'finalize',
          loanId: 'loan-api-1',
          milestoneId: 1,
          asOf: '2026-11-08T00:00:01.000Z',
        }),
      })
    );
    expect(finalizeRes.status).toBe(200);
    const finalizedData = await finalizeRes.json();
    expect(finalizedData.finalization.status).toBe('finalized');
    expect(finalizedData.finalization.transactionHash).toBe('tx-stellar-1930');
    expect(executeMilestoneFinalizationOnStellarMock).toHaveBeenCalledTimes(1);
    expect(emitMilestonePayoutApprovedMock).toHaveBeenCalledWith(
      expect.objectContaining({
        loanId: 'loan-api-1',
        verifierWalletAddress: 'GVERIFIERAPI',
        verifierRewardUsdc: 15,
        farmerPayoutUsdc: 735,
      })
    );

    const doubleRes = await POST(
      new Request('http://localhost/api/escrow/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'finalize',
          loanId: 'loan-api-1',
          milestoneId: 1,
          asOf: '2026-11-09T00:00:00.000Z',
        }),
      })
    );
    expect(doubleRes.status).toBe(409);
    const doubleData = await doubleRes.json();
    expect(doubleData.code).toBe('ALREADY_FINALIZED');

    const getRes = await GET(
      new Request('http://localhost/api/escrow/finalize?loanId=loan-api-1&milestoneId=1')
    );
    expect(getRes.status).toBe(200);
    const getData = await getRes.json();
    expect(getData.finalization.status).toBe('finalized');
  });

  it('blocks disputed milestones and returns 404 for unknown loans', async () => {
    const missingGet = await GET(
      new Request('http://localhost/api/escrow/finalize?loanId=unknown&milestoneId=1')
    );
    expect(missingGet.status).toBe(404);

    await POST(
      new Request('http://localhost/api/escrow/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'approve',
          loanId: 'loan-api-dispute',
          farmerWalletAddress: 'GFARMER',
          approvingVerifierAddress: 'GVERIFIER',
          totalDisbursementUsdc: 500,
          approvedAt: '2026-11-01T00:00:00.000Z',
          gracePeriodEndsAt: '2026-11-02T00:00:00.000Z',
        }),
      })
    );

    const disputeRes = await POST(
      new Request('http://localhost/api/escrow/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'dispute',
          loanId: 'loan-api-dispute',
        }),
      })
    );
    expect(disputeRes.status).toBe(200);

    const blockedRes = await POST(
      new Request('http://localhost/api/escrow/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'finalize',
          loanId: 'loan-api-dispute',
          asOf: '2026-11-05T00:00:00.000Z',
        }),
      })
    );
    expect(blockedRes.status).toBe(409);
    expect((await blockedRes.json()).code).toBe('MILESTONE_DISPUTED');
  });
});
