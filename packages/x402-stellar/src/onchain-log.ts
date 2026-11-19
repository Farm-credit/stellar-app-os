// Ticket 3.6 — loguea un pago verificado en el registry on-chain (Soroban).
// Llamado opcionalmente desde server.ts después de verificar un pago x402.
// log_payment no requiere auth on-chain (ver contracts/soroban-registry):
// la protección es por tx_hash único, así que cualquier cuenta puede firmar.
//
// #75: getTransaction wait is bounded (max attempts + deadline). Never hang
// forever on NOT_FOUND if Soroban RPC stalls after sendTransaction.

import {
  rpc,
  Contract,
  TransactionBuilder,
  BASE_FEE,
  Networks,
  Keypair,
  Address,
  nativeToScVal,
} from "@stellar/stellar-sdk";

export interface OnChainLogOpts {
  contractId: string;
  providerId: bigint;
  callerSecret: string;
  sorobanUrl?: string;
  network?: "testnet" | "public";
  /** Max getTransaction polls while status is NOT_FOUND (default 15). */
  maxGetTransactionAttempts?: number;
  /** Delay between getTransaction polls in ms (default 1000). */
  pollIntervalMs?: number;
  /** Overall confirmation wait deadline in ms (default 30_000). */
  confirmationTimeoutMs?: number;
}

const DEFAULT_MAX_ATTEMPTS = 15;
const DEFAULT_POLL_INTERVAL_MS = 1000;
const DEFAULT_CONFIRMATION_TIMEOUT_MS = 30_000;

export async function logPaymentOnChain(
  opts: OnChainLogOpts,
  payment: { txHash: string; payer: string; amount: string },
): Promise<void> {
  const sorobanUrl =
    opts.sorobanUrl ??
    (opts.network === "public"
      ? "https://soroban.stellar.org"
      : "https://soroban-testnet.stellar.org");
  const networkPassphrase =
    opts.network === "public" ? Networks.PUBLIC : Networks.TESTNET;

  const server = new rpc.Server(sorobanUrl);
  const caller = Keypair.fromSecret(opts.callerSecret);
  const contract = new Contract(opts.contractId);

  const account = await server.getAccount(caller.publicKey());
  const amountStroops = BigInt(Math.round(Number(payment.amount) * 10_000_000));
  const txHashBytes = Buffer.from(payment.txHash, "hex");

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase,
  })
    .addOperation(
      contract.call(
        "log_payment",
        nativeToScVal(opts.providerId, { type: "u64" }),
        nativeToScVal(Address.fromString(payment.payer), { type: "address" }),
        nativeToScVal(amountStroops, { type: "u64" }),
        nativeToScVal(txHashBytes, { type: "bytes" }),
      ),
    )
    .setTimeout(60)
    .build();

  const prepared = await server.prepareTransaction(tx);
  prepared.sign(caller);

  const sendRes = await server.sendTransaction(prepared);
  if (sendRes.status === "ERROR") {
    throw new Error(
      `log_payment sendTransaction failed: ${JSON.stringify(sendRes.errorResult)}`,
    );
  }

  const maxAttempts = opts.maxGetTransactionAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const pollIntervalMs = opts.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const timeoutMs = opts.confirmationTimeoutMs ?? DEFAULT_CONFIRMATION_TIMEOUT_MS;
  const deadline = Date.now() + timeoutMs;

  let getRes = await server.getTransaction(sendRes.hash);
  let attempts = 1;

  while (
    getRes.status === "NOT_FOUND" &&
    attempts < maxAttempts &&
    Date.now() < deadline
  ) {
    await new Promise((r) => setTimeout(r, pollIntervalMs));
    getRes = await server.getTransaction(sendRes.hash);
    attempts += 1;
  }

  if (getRes.status === "NOT_FOUND") {
    throw new Error(
      `log_payment confirmation timed out after ${attempts} getTransaction attempt(s) ` +
        `(maxAttempts=\( {maxAttempts}, timeoutMs= \){timeoutMs}, hash=${sendRes.hash})`,
    );
  }

  if (getRes.status !== "SUCCESS") {
    throw new Error(`log_payment tx failed: ${JSON.stringify(getRes)}`);
  }
    }
