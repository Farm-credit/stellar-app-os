import { Address, Keypair, nativeToScVal } from '@stellar/stellar-sdk';
import type { Pool } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import { getVerifierPerformanceReport } from './performance';

function createPool(query: ReturnType<typeof vi.fn>): Pool {
  return { query } as unknown as Pool;
}

describe('getVerifierPerformanceReport', () => {
  it('calculates approval accuracy, dispute rate, and average turnaround', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          verifier_address: 'GVERIFIER',
          total_audits: '4',
          approvals: '3',
          accurate_approvals: '2',
          accuracy_sample_size: '3',
          disputed_audits: '1',
          average_turnaround_seconds: '1800',
        },
      ],
    });

    const report = await getVerifierPerformanceReport(createPool(query), undefined);

    expect(report.verifiers).toEqual([
      {
        verifierAddress: 'GVERIFIER',
        totalAudits: 4,
        approvals: 3,
        accurateApprovals: 2,
        accuracySampleSize: 3,
        approvalAccuracyPercent: (2 / 3) * 100,
        disputedAudits: 1,
        disputeRatePercent: 25,
        averageTurnaroundSeconds: 1800,
      },
    ]);
    expect(report).toMatchObject({ slashHistory: [], slashHistoryConfigured: false });
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toContain("AND dispute_outcome = 'upheld'");
    expect(query.mock.calls[0][0]).toContain("COUNT(*) FILTER (WHERE decision = 'approved')");
  });

  it('decodes indexed slashed events from Soroban XDR', async () => {
    const verifierAddress = Keypair.random().publicKey();
    const topicsXdr = [
      nativeToScVal('slashed', { type: 'symbol' }).toXDR('base64'),
      nativeToScVal(Address.fromString(verifierAddress), { type: 'address' }).toXDR('base64'),
    ];
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'event-1',
            ledger_closed_at: new Date('2026-01-02T03:04:05.000Z'),
            topics_xdr: topicsXdr,
            value_xdr: nativeToScVal(5000n, { type: 'i128' }).toXDR('base64'),
          },
          {
            id: 'event-2',
            ledger_closed_at: new Date('2026-01-02T03:04:05.000Z'),
            topics_xdr: [
              nativeToScVal('deposited', { type: 'symbol' }).toXDR('base64'),
              topicsXdr[1],
            ],
            value_xdr: nativeToScVal(100n, { type: 'i128' }).toXDR('base64'),
          },
        ],
      });

    const report = await getVerifierPerformanceReport(createPool(query), 'CSTAKINGCONTRACT');

    expect(report.slashHistory).toEqual([
      {
        id: 'event-1',
        verifierAddress,
        amount: '5000',
        occurredAt: '2026-01-02T03:04:05.000Z',
      },
    ]);
    expect(report.slashHistoryConfigured).toBe(true);
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[1][1]).toEqual(['CSTAKINGCONTRACT']);
  });
});
