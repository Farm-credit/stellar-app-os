import { beforeEach, describe, expect, mock, test } from "bun:test";

let getTransactionStatuses: Array<{ status: string }> = [];
let getTransactionCalls = 0;
let sendTransactionResult: { status: string; hash: string; errorResult?: unknown } = {
  status: "PENDING",
  hash: "deadbeef",
};

mock.module("@stellar/stellar-sdk", () => {
  class FakeServer {
    async getAccount() {
      return { accountId: "GFAKEACCOUNT", sequenceNumber: () => "1" };
    }
    async prepareTransaction(tx: { sign?: unknown }) {
      return tx;
    }
    async sendTransaction() {
      return sendTransactionResult;
    }
    async getTransaction() {
      getTransactionCalls += 1;
      const next = getTransactionStatuses.shift();
      return next ?? { status: "NOT_FOUND" };
    }
  }

  return {
    rpc: { Server: FakeServer },
    Contract: class {
      call() {
        return { type: "invoke" };
      }
    },
    TransactionBuilder: class {
      constructor() {}
      addOperation() {
        return this;
      }
      setTimeout() {
        return this;
      }
      build() {
        return { sign() {} };
      }
    },
    BASE_FEE: "100",
    Networks: {
      PUBLIC: "Public Global Stellar Network ; September 2015",
      TESTNET: "Test SDF Network ; September 2015",
    },
    Keypair: {
      fromSecret: () => ({ publicKey: () => "GFAKEACCOUNT", sign: () => {} }),
    },
    Address: { fromString: (value: string) => ({ toString: () => value }) },
    nativeToScVal: (value: unknown) => value,
  };
});

const { logPaymentOnChain } = await import("../src/onchain-log");

const baseOpts = {
  contractId: "CCONTRACT",
  providerId: 1n,
  callerSecret: "SFAKESECRET",
  network: "testnet" as const,
};

const payment = { txHash: "aabbccdd", payer: "GPAYER", amount: "0.005" };

beforeEach(() => {
  getTransactionStatuses = [];
  getTransactionCalls = 0;
  sendTransactionResult = { status: "PENDING", hash: "deadbeef" };
});

describe("logPaymentOnChain", () => {
  test("resolves when getTransaction reaches SUCCESS", async () => {
    getTransactionStatuses = [
      { status: "NOT_FOUND" },
      { status: "NOT_FOUND" },
      { status: "SUCCESS" },
    ];

    await expect(logPaymentOnChain(baseOpts, payment)).resolves.toBeUndefined();
    expect(getTransactionCalls).toBe(3);
  });

  test("throws a clear error when confirmation times out (max attempts)", async () => {
    getTransactionStatuses = [
      { status: "NOT_FOUND" },
      { status: "NOT_FOUND" },
      { status: "NOT_FOUND" },
      { status: "NOT_FOUND" },
    ];

    await expect(
      logPaymentOnChain(
        {
          ...baseOpts,
          maxGetTransactionAttempts: 3,
          pollIntervalMs: 1,
          confirmationTimeoutMs: 60_000,
        },
        payment,
      ),
    ).rejects.toThrow(/confirmation timed out/i);

    expect(getTransactionCalls).toBe(3);
  });

  test("throws when sendTransaction returns ERROR", async () => {
    sendTransactionResult = {
      status: "ERROR",
      hash: "deadbeef",
      errorResult: { code: "tx_failed" },
    };

    await expect(logPaymentOnChain(baseOpts, payment)).rejects.toThrow(
      /sendTransaction failed/i,
    );
  });
});
