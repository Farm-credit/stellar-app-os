/**
 * Soroban RPC client for the carbon-credits contract.
 *
 * Read calls (estimateOffset, totalOffsetForSponsor) simulate only — no
 * transaction submission required.
 *
 * Write calls (setRate, recordCredit) are admin-only and use the platform
 * fee-payer keypair (STELLAR_FEE_PAYER_SECRET) to build, sign, and submit.
 */

import {
  Address,
  Contract,
  Keypair,
  Networks,
  SorobanRpc,
  TransactionBuilder,
  nativeToScVal,
  scValToNative,
  xdr,
} from '@stellar/stellar-sdk';
import type { NetworkType } from '@/lib/types/wallet';

// ── Config ────────────────────────────────────────────────────────────────────

const SOROBAN_RPC: Record<NetworkType, string> = {
  testnet: 'https://soroban-testnet.stellar.org',
  mainnet: 'https://soroban-mainnet.stellar.org',
};

function getContractId(_network: NetworkType): string {
  const id = process.env.NEXT_PUBLIC_CONTRACT_CARBON_CREDITS;
  if (!id) throw new Error('NEXT_PUBLIC_CONTRACT_CARBON_CREDITS is not set');
  return id;
}

function getNetworkPassphrase(network: NetworkType): string {
  return network === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET;
}

function getFeePayerKeypair(): Keypair {
  const secret = process.env.STELLAR_FEE_PAYER_SECRET;
  if (!secret) throw new Error('STELLAR_FEE_PAYER_SECRET is not set');
  return Keypair.fromSecret(secret);
}

// ── XDR helpers ───────────────────────────────────────────────────────────────

function symbolToScVal(slug: string): xdr.ScVal {
  return xdr.ScVal.scvSymbol(slug);
}

function u32ToScVal(n: number): xdr.ScVal {
  return xdr.ScVal.scvU32(n);
}

function i128ToScVal(n: number): xdr.ScVal {
  return nativeToScVal(BigInt(n), { type: 'i128' });
}

function addressToScVal(pubKey: string): xdr.ScVal {
  return new Address(pubKey).toScVal();
}

// ── Shared simulation helper ──────────────────────────────────────────────────

async function simulate(
  network: NetworkType,
  method: string,
  args: xdr.ScVal[]
): Promise<SorobanRpc.Api.SimulateTransactionSuccessResponse> {
  const server = new SorobanRpc.Server(SOROBAN_RPC[network], { allowHttp: false });
  const contractId = getContractId(network);
  const feePayer = getFeePayerKeypair();
  const account = await server.getAccount(feePayer.publicKey());

  const tx = new TransactionBuilder(account, {
    fee: '1000000',
    networkPassphrase: getNetworkPassphrase(network),
  })
    .addOperation(new Contract(contractId).call(method, ...args))
    .setTimeout(30)
    .build();

  const result = await server.simulateTransaction(tx);
  if (SorobanRpc.Api.isSimulationError(result)) {
    throw new Error(result.error ?? 'Simulation failed');
  }
  return result as SorobanRpc.Api.SimulateTransactionSuccessResponse;
}

// ── Shared write helper ───────────────────────────────────────────────────────

async function invokeWrite(network: NetworkType, method: string, args: xdr.ScVal[]): Promise<void> {
  const server = new SorobanRpc.Server(SOROBAN_RPC[network], { allowHttp: false });
  const contractId = getContractId(network);
  const feePayer = getFeePayerKeypair();
  const account = await server.getAccount(feePayer.publicKey());

  const tx = new TransactionBuilder(account, {
    fee: '1000000',
    networkPassphrase: getNetworkPassphrase(network),
  })
    .addOperation(new Contract(contractId).call(method, ...args))
    .setTimeout(30)
    .build();

  const simResult = await server.simulateTransaction(tx);
  if (SorobanRpc.Api.isSimulationError(simResult)) {
    throw new Error(simResult.error ?? 'Simulation failed');
  }

  const prepared = SorobanRpc.assembleTransaction(tx, simResult).build();
  prepared.sign(feePayer);

  const sendResult = await server.sendTransaction(prepared);
  if (sendResult.status === 'ERROR') {
    throw new Error(
      `Transaction submission failed: ${sendResult.errorResult?.toXDR('base64') ?? 'unknown'}`
    );
  }

  await pollForConfirmation(server, sendResult.hash);
}

async function pollForConfirmation(
  server: SorobanRpc.Server,
  txHash: string,
  maxAttempts = 20,
  intervalMs = 1500
): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, intervalMs));
    const result = await server.getTransaction(txHash);
    if (result.status === SorobanRpc.Api.GetTransactionStatus.SUCCESS) return;
    if (result.status === SorobanRpc.Api.GetTransactionStatus.FAILED) {
      throw new Error(`Transaction failed: ${result.resultMetaXdr?.toXDR('base64') ?? 'unknown'}`);
    }
  }
  throw new Error('Transaction confirmation timeout');
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Returns lifetime grams CO₂ offset for one tree of `slug` at `ageYears`. */
export async function estimateOffset(
  slug: string,
  ageYears: number,
  network: NetworkType
): Promise<bigint> {
  const sim = await simulate(network, 'estimate_offset', [
    symbolToScVal(slug),
    u32ToScVal(ageYears),
  ]);
  return scValToNative(sim.result!.retval) as bigint;
}

/** Returns total accumulated grams CO₂ offset for `sponsorPubKey`. */
export async function totalOffsetForSponsor(
  sponsorPubKey: string,
  network: NetworkType
): Promise<bigint> {
  const sim = await simulate(network, 'total_offset_for_sponsor', [addressToScVal(sponsorPubKey)]);
  return scValToNative(sim.result!.retval) as bigint;
}

/** Admin-only: accumulate CO₂ credits for a sponsor. */
export async function recordCredit(
  sponsorPubKey: string,
  slug: string,
  treeCount: number,
  ageYears: number,
  network: NetworkType
): Promise<void> {
  await invokeWrite(network, 'record_credit', [
    addressToScVal(sponsorPubKey),
    symbolToScVal(slug),
    u32ToScVal(treeCount),
    u32ToScVal(ageYears),
  ]);
}

/** Admin-only: register or update a species sequestration rate. */
export async function setRate(
  slug: string,
  co2ScaledX100: number,
  maturityYears: number,
  network: NetworkType
): Promise<void> {
  await invokeWrite(network, 'set_rate', [
    symbolToScVal(slug),
    i128ToScVal(co2ScaledX100),
    u32ToScVal(maturityYears),
  ]);
}
