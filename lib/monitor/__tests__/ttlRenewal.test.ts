import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetLedgerEntries = vi.hoisted(() => vi.fn());
const mockGetAccount = vi.hoisted(() => vi.fn());
const mockSimulateTransaction = vi.hoisted(() => vi.fn());
const mockSendTransaction = vi.hoisted(() => vi.fn());
const mockGetTransaction = vi.hoisted(() => vi.fn());
const mockKeypairFromSecret = vi.hoisted(() => vi.fn());
const mockIsSimulationError = vi.hoisted(() => vi.fn());
const mockAssembleTransaction = vi.hoisted(() => vi.fn());
const mockSign = vi.hoisted(() => vi.fn());

vi.mock('@stellar/stellar-sdk', () => {
  class FakeContract {
    id: string;
    constructor(id: string) {
      this.id = id;
    }
    getFootprint() {
      return { __ledgerKeyFor: this.id };
    }
  }
  class FakeTransactionBuilder {
    addOperation() {
      return this;
    }
    setSorobanData() {
      return this;
    }
    setTimeout() {
      return this;
    }
    build() {
      return { __fakeTx: true };
    }
  }
  class FakeSorobanDataBuilder {
    setReadOnly() {
      return this;
    }
    build() {
      return { __fakeSorobanData: true };
    }
  }

  return {
    Contract: FakeContract,
    Keypair: { fromSecret: mockKeypairFromSecret },
    Operation: { extendFootprintTtl: vi.fn(() => ({ __op: 'extendFootprintTtl' })) },
    SorobanDataBuilder: FakeSorobanDataBuilder,
    TransactionBuilder: FakeTransactionBuilder,
    SorobanRpc: {
      Server: vi.fn().mockImplementation(function () {
        return {
          getLedgerEntries: mockGetLedgerEntries,
          getAccount: mockGetAccount,
          simulateTransaction: mockSimulateTransaction,
          sendTransaction: mockSendTransaction,
          getTransaction: mockGetTransaction,
        };
      }),
      Api: {
        isSimulationError: mockIsSimulationError,
        GetTransactionStatus: { SUCCESS: 'SUCCESS', FAILED: 'FAILED', NOT_FOUND: 'NOT_FOUND' },
      },
      assembleTransaction: mockAssembleTransaction,
    },
  };
});

vi.mock('@/lib/logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { Keypair, SorobanRpc } from '@stellar/stellar-sdk';
import { checkAndRenewContractTtl, runTtlRenewalCheck } from '../ttlRenewal';
import type { TtlRenewalConfig } from '../ttlRenewalTypes';

const CONTRACT_A = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const CONTRACT_B = 'CBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';
const SIGNER_SECRET = 'SABCDEFVALIDLOOKINGSECRETKEYAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const SIGNER_PUBLIC = 'GDSIGNERPUBLICKEYAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const CONFIRM_POLL_INTERVAL_MS = 2_000;

function baseConfig(overrides: Partial<TtlRenewalConfig> = {}): TtlRenewalConfig {
  return {
    rpcUrl: 'https://soroban-testnet.stellar.org',
    networkPassphrase: 'Test SDF Network ; September 2015',
    signerSecret: SIGNER_SECRET,
    contractIds: [CONTRACT_A],
    thresholdLedgers: 1000,
    extendToLedgers: 500_000,
    pollIntervalMs: 3_600_000,
    ...overrides,
  };
}

function mockSuccessfulRenewal(hash: string) {
  mockGetAccount.mockResolvedValue({});
  mockSimulateTransaction.mockResolvedValue({ __sim: true });
  mockIsSimulationError.mockReturnValue(false);
  mockAssembleTransaction.mockReturnValue({ build: () => ({ sign: mockSign }) });
  mockSendTransaction.mockResolvedValue({ status: 'PENDING', hash });
  mockGetTransaction.mockResolvedValue({ status: 'SUCCESS' });
}

beforeEach(() => {
  // Reset call history AND any per-test mockResolvedValue/mockReturnValue —
  // vi.clearAllMocks() only clears call history, which previously let one
  // test's mockResolvedValue leak into the next. Avoid vi.resetAllMocks()
  // since it would also wipe the SorobanRpc.Server/Contract constructor
  // mocks defined once in the vi.mock() factory above.
  mockGetLedgerEntries.mockReset();
  mockGetAccount.mockReset();
  mockSimulateTransaction.mockReset();
  mockSendTransaction.mockReset();
  mockGetTransaction.mockReset();
  mockIsSimulationError.mockReset();
  mockAssembleTransaction.mockReset();
  mockSign.mockReset();
  mockKeypairFromSecret.mockReset();
  mockKeypairFromSecret.mockReturnValue({ publicKey: () => SIGNER_PUBLIC });
});

describe('checkAndRenewContractTtl', () => {
  it('reports healthy when remaining TTL is above the threshold', async () => {
    mockGetLedgerEntries.mockResolvedValue({
      entries: [{ liveUntilLedgerSeq: 5000 }],
      latestLedger: 1000,
    });
    const server = new SorobanRpc.Server('url');
    const signer = Keypair.fromSecret(SIGNER_SECRET);

    const result = await checkAndRenewContractTtl(
      CONTRACT_A,
      baseConfig({ thresholdLedgers: 1000 }),
      server as never,
      signer as never
    );

    expect(result).toEqual({
      contractId: CONTRACT_A,
      status: 'healthy',
      currentLedger: 1000,
      liveUntilLedgerSeq: 5000,
      remainingLedgers: 4000,
    });
    expect(mockGetAccount).not.toHaveBeenCalled();
    expect(mockSendTransaction).not.toHaveBeenCalled();
  });

  it('renews the TTL when the remaining TTL is below the threshold', async () => {
    mockGetLedgerEntries.mockResolvedValue({
      entries: [{ liveUntilLedgerSeq: 1050 }],
      latestLedger: 1000,
    });
    mockSuccessfulRenewal('renewal-tx-hash');

    vi.useFakeTimers();
    try {
      const server = new SorobanRpc.Server('url');
      const signer = Keypair.fromSecret(SIGNER_SECRET);
      const resultPromise = checkAndRenewContractTtl(
        CONTRACT_A,
        baseConfig({ thresholdLedgers: 1000, extendToLedgers: 500_000 }),
        server as never,
        signer as never
      );
      await vi.advanceTimersByTimeAsync(CONFIRM_POLL_INTERVAL_MS);
      const result = await resultPromise;

      expect(result.status).toBe('renewed');
      expect(result.transactionHash).toBe('renewal-tx-hash');
      expect(result.newLiveUntilLedgerSeq).toBe(1000 + 500_000);
      expect(result.remainingLedgers).toBe(50);
      expect(mockSign).toHaveBeenCalledWith(signer);
    } finally {
      vi.useRealTimers();
    }
  });

  it('returns an error result (not a throw) when the RPC read fails', async () => {
    mockGetLedgerEntries.mockRejectedValue(new Error('ECONNREFUSED'));
    const server = new SorobanRpc.Server('url');
    const signer = Keypair.fromSecret(SIGNER_SECRET);

    const result = await checkAndRenewContractTtl(
      CONTRACT_A,
      baseConfig(),
      server as never,
      signer as never
    );

    expect(result.status).toBe('error');
    expect(result.error).toContain('ECONNREFUSED');
    expect(mockGetAccount).not.toHaveBeenCalled();
  });

  it('returns an error result when the contract instance entry is missing', async () => {
    mockGetLedgerEntries.mockResolvedValue({ entries: [], latestLedger: 1000 });
    const server = new SorobanRpc.Server('url');
    const signer = Keypair.fromSecret(SIGNER_SECRET);

    const result = await checkAndRenewContractTtl(
      CONTRACT_A,
      baseConfig(),
      server as never,
      signer as never
    );

    expect(result.status).toBe('error');
    expect(result.currentLedger).toBe(1000);
  });

  it('returns an error result when transaction submission is rejected', async () => {
    mockGetLedgerEntries.mockResolvedValue({
      entries: [{ liveUntilLedgerSeq: 1050 }],
      latestLedger: 1000,
    });
    mockGetAccount.mockResolvedValue({});
    mockSimulateTransaction.mockResolvedValue({ __sim: true });
    mockIsSimulationError.mockReturnValue(false);
    mockAssembleTransaction.mockReturnValue({ build: () => ({ sign: mockSign }) });
    mockSendTransaction.mockResolvedValue({ status: 'ERROR', errorResult: {} });

    const server = new SorobanRpc.Server('url');
    const signer = Keypair.fromSecret(SIGNER_SECRET);
    const result = await checkAndRenewContractTtl(
      CONTRACT_A,
      baseConfig({ thresholdLedgers: 1000 }),
      server as never,
      signer as never
    );

    expect(result.status).toBe('error');
    expect(mockGetTransaction).not.toHaveBeenCalled();
  });

  it('returns an error result when simulation fails', async () => {
    mockGetLedgerEntries.mockResolvedValue({
      entries: [{ liveUntilLedgerSeq: 1050 }],
      latestLedger: 1000,
    });
    mockGetAccount.mockResolvedValue({});
    mockSimulateTransaction.mockResolvedValue({ __sim: true });
    mockIsSimulationError.mockReturnValue(true);

    const server = new SorobanRpc.Server('url');
    const signer = Keypair.fromSecret(SIGNER_SECRET);
    const result = await checkAndRenewContractTtl(
      CONTRACT_A,
      baseConfig({ thresholdLedgers: 1000 }),
      server as never,
      signer as never
    );

    expect(result.status).toBe('error');
    expect(mockSendTransaction).not.toHaveBeenCalled();
  });
});

describe('runTtlRenewalCheck', () => {
  afterEach(() => {
    delete process.env.TTL_RENEWAL_SIGNER_SECRET;
    delete process.env.TTL_RENEWAL_CONTRACT_IDS;
    delete process.env.TTL_RENEWAL_THRESHOLD_LEDGERS;
  });

  it('skips the check and never touches the network when the signer secret is missing', async () => {
    process.env.TTL_RENEWAL_CONTRACT_IDS = CONTRACT_A;

    const summary = await runTtlRenewalCheck();

    expect(summary.results).toEqual([]);
    expect(mockGetLedgerEntries).not.toHaveBeenCalled();
    expect(mockKeypairFromSecret).not.toHaveBeenCalled();
  });

  it('skips the check when no contract IDs are configured', async () => {
    process.env.TTL_RENEWAL_SIGNER_SECRET = SIGNER_SECRET;

    const summary = await runTtlRenewalCheck();

    expect(summary.results).toEqual([]);
    expect(mockGetLedgerEntries).not.toHaveBeenCalled();
  });

  it('skips the check when the signer secret is not a valid Stellar key', async () => {
    process.env.TTL_RENEWAL_SIGNER_SECRET = 'not-a-real-secret';
    process.env.TTL_RENEWAL_CONTRACT_IDS = CONTRACT_A;
    mockKeypairFromSecret.mockImplementation(() => {
      throw new Error('Invalid seed');
    });

    const summary = await runTtlRenewalCheck();

    expect(summary.results).toEqual([]);
    expect(mockGetLedgerEntries).not.toHaveBeenCalled();
  });

  it('checks every configured contract sequentially and reports per-contract status', async () => {
    process.env.TTL_RENEWAL_SIGNER_SECRET = SIGNER_SECRET;
    process.env.TTL_RENEWAL_CONTRACT_IDS = `${CONTRACT_A}, ${CONTRACT_B}`;
    process.env.TTL_RENEWAL_THRESHOLD_LEDGERS = '1000';
    mockGetLedgerEntries
      .mockResolvedValueOnce({ entries: [{ liveUntilLedgerSeq: 5000 }], latestLedger: 1000 })
      .mockResolvedValueOnce({ entries: [{ liveUntilLedgerSeq: 1050 }], latestLedger: 1000 });
    mockSuccessfulRenewal('multi-contract-hash');

    vi.useFakeTimers();
    try {
      const summaryPromise = runTtlRenewalCheck();
      await vi.advanceTimersByTimeAsync(CONFIRM_POLL_INTERVAL_MS);
      const summary = await summaryPromise;

      expect(summary.results).toHaveLength(2);
      expect(summary.results[0]).toMatchObject({ contractId: CONTRACT_A, status: 'healthy' });
      expect(summary.results[1]).toMatchObject({ contractId: CONTRACT_B, status: 'renewed' });
      expect(mockGetLedgerEntries).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('isolates an RPC failure on one contract so the rest are still checked', async () => {
    process.env.TTL_RENEWAL_SIGNER_SECRET = SIGNER_SECRET;
    process.env.TTL_RENEWAL_CONTRACT_IDS = `${CONTRACT_A}, ${CONTRACT_B}`;
    process.env.TTL_RENEWAL_THRESHOLD_LEDGERS = '1000';
    mockGetLedgerEntries
      .mockRejectedValueOnce(new Error('RPC timeout'))
      .mockResolvedValueOnce({ entries: [{ liveUntilLedgerSeq: 5000 }], latestLedger: 1000 });

    const summary = await runTtlRenewalCheck();

    expect(summary.results).toHaveLength(2);
    expect(summary.results[0]).toMatchObject({ contractId: CONTRACT_A, status: 'error' });
    expect(summary.results[1]).toMatchObject({ contractId: CONTRACT_B, status: 'healthy' });
  });
});
