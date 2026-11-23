import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db/client', () => ({ getPool: () => ({ mockedPool: true }) }));
vi.mock('@/lib/carbon/verified-field-credits', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    issueFieldCreditForTree: vi.fn(),
  };
});
vi.mock('@/lib/webhook/offset-verification-bridge', () => ({
  notifyCreditVerified: vi.fn(() => Promise.resolve([])),
}));

import { Keypair } from '@stellar/stellar-sdk';
import { issueFieldCreditForTree } from '@/lib/carbon/verified-field-credits';
import { notifyCreditVerified } from '@/lib/webhook/offset-verification-bridge';
import { POST } from './route';

const WALLET = Keypair.random().publicKey();
const mockedIssue = vi.mocked(issueFieldCreditForTree);
const mockedNotify = vi.mocked(notifyCreditVerified);

beforeEach(() => {
  vi.clearAllMocks();
  process.env.FIELD_CREDIT_ISSUER_TOKEN = 'x'.repeat(32);
  process.env.NEXT_PUBLIC_CONTRACT_CARBON_CREDITS =
    'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';
});

describe('POST /api/field-credits', () => {
  it('emits credit.verified after confirmed field credit issuance', async () => {
    mockedIssue.mockResolvedValueOnce({
      credit: {
        treeId: 12,
        treeRef: 'TREE-12',
        sponsorWallet: WALLET,
        projectId: 'PLOT-001',
        baselineSampleId: 's1',
        latestSampleId: 's2',
        baselineDate: '2025-01-01',
        latestDate: '2026-06-01',
        measuredDeltaKg: 500,
        amountGrams: 500_000,
        evidenceDigest: 'a'.repeat(64),
      },
      transactionHash: 'txhash123',
      issuanceId: 'iss_uuid_1',
      projectName: 'PLOT-001',
      verifiedBy: 'Verifier One',
    });

    const res = await POST(
      new Request('https://app.example/api/field-credits', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${'x'.repeat(32)}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sponsorWallet: WALLET, treeId: 12, network: 'testnet' }),
      })
    );
    expect(res.status).toBe(201);
    expect(mockedNotify).toHaveBeenCalledWith(
      expect.objectContaining({
        creditId: 'iss_uuid_1',
        projectId: 'PLOT-001',
        quantityTonnes: 0.5,
        verifier: 'Verifier One',
        transactionHash: 'txhash123',
      })
    );
  });
});
