import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as StellarSdk from '@stellar/stellar-sdk';
import { Asset, Keypair, Networks, TransactionBuilder } from '@stellar/stellar-sdk';
import { submitMilestoneDisbursement } from '../escrow';

const { loadAccountMock, testUsdcIssuer } = vi.hoisted(() => ({
  loadAccountMock: vi.fn(),
  testUsdcIssuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
}));

vi.mock('@/lib/stellar/transaction', () => ({
  getUsdcAsset: () => new Asset('USDC', testUsdcIssuer),
  getStellarExplorerUrl: (hash: string, network: string) =>
    `https://stellar.expert/explorer/${network}/tx/${hash}`,
}));

vi.mock('@stellar/stellar-sdk', async () => {
  const actual = await vi.importActual<typeof StellarSdk>('@stellar/stellar-sdk');
  class MockHorizonServer {
    loadAccount = loadAccountMock;
  }
  return {
    ...actual,
    Horizon: {
      ...actual.Horizon,
      Server: MockHorizonServer,
    },
  };
});

describe('submitMilestoneDisbursement', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.clearAllMocks();
  });

  it('builds an atomic Stellar tx with 98% farmer payment and 2% verifier reward payment', async () => {
    const escrowKp = Keypair.random();
    const farmerKp = Keypair.random();
    const verifierKp = Keypair.random();

    loadAccountMock.mockResolvedValue({
      accountId: () => escrowKp.publicKey(),
      sequenceNumber: () => '100',
      incrementSequenceNumber: vi.fn(),
    });

    let submittedTxXdr = '';
    globalThis.fetch = vi.fn((_url, init) => {
      const body = String(init?.body ?? '');
      const params = new URLSearchParams(body);
      submittedTxXdr = params.get('tx') ?? '';
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ hash: 'tx-atomic-split-1930' }),
      });
    }) as unknown as typeof fetch;

    const result = await submitMilestoneDisbursement(
      750,
      farmerKp.publicKey(),
      escrowKp.secret(),
      'testnet',
      'loan-1930',
      { verifierWalletAddress: verifierKp.publicKey(), milestoneId: 1 }
    );

    expect(result.transactionHash).toBe('tx-atomic-split-1930');
    expect(result.releasedAmountUsdc).toBe(750);
    expect(result.farmerPayoutUsdc).toBe(735);
    expect(result.verifierRewardUsdc).toBe(15);
    expect(result.verifierWalletAddress).toBe(verifierKp.publicKey());

    const tx = TransactionBuilder.fromXDR(submittedTxXdr, Networks.TESTNET);
    expect(tx.operations).toHaveLength(2);
    expect(tx.operations[0]).toMatchObject({
      type: 'payment',
      destination: farmerKp.publicKey(),
      amount: '735.0000000',
    });
    expect(tx.operations[1]).toMatchObject({
      type: 'payment',
      destination: verifierKp.publicKey(),
      amount: '15.0000000',
    });
  });

  it('rejects an empty verifierWalletAddress override', async () => {
    const escrowKp = Keypair.random();
    const farmerKp = Keypair.random();
    await expect(
      submitMilestoneDisbursement(
        100,
        farmerKp.publicKey(),
        escrowKp.secret(),
        'testnet',
        'loan-1',
        {
          verifierWalletAddress: '   ',
        }
      )
    ).rejects.toThrow('verifierWalletAddress must not be empty');
  });
});
