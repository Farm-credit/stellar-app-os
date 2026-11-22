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

function simulationRetval(result: SorobanRpc.Api.SimulateTransactionSuccessResponse): xdr.ScVal {
  const retval = result.result?.retval;
  if (!retval) throw new Error('Soroban simulation returned no contract value.');
  return retval;
}

// ── Shared write helper ───────────────────────────────────────────────────────

async function invokeWrite(
  network: NetworkType,
  method: string,
  args: xdr.ScVal[]
): Promise<string> {
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
  return sendResult.hash;
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
  return scValToNative(simulationRetval(sim)) as bigint;
}

/** Returns total accumulated grams CO₂ offset for `sponsorPubKey`. */
export async function totalOffsetForSponsor(
  sponsorPubKey: string,
  network: NetworkType
): Promise<bigint> {
  const sim = await simulate(network, 'total_offset_for_sponsor', [addressToScVal(sponsorPubKey)]);
  return scValToNative(simulationRetval(sim)) as bigint;
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

/** Admin-only: issue a measured field-data delta with a write-once evidence digest. */
export async function recordFieldCredit(
  sponsorPubKey: string,
  projectId: string,
  amountGrams: number,
  evidenceDigest: string,
  network: NetworkType
): Promise<string> {
  if (!Number.isSafeInteger(amountGrams) || amountGrams <= 0) {
    throw new Error('amountGrams must be a positive safe integer');
  }
  if (!/^[a-f0-9]{64}$/.test(evidenceDigest)) {
    throw new Error('evidenceDigest must be a lowercase SHA-256 hex digest');
  }

  return invokeWrite(network, 'record_field_credit', [
    addressToScVal(sponsorPubKey),
    symbolToScVal(projectId),
    nativeToScVal(BigInt(amountGrams), { type: 'u64' }),
    xdr.ScVal.scvBytes(Buffer.from(evidenceDigest, 'hex')),
  ]);
}

export interface VerifiedFieldRetailLot {
  id: number;
  projectId: string;
  seller: string;
  totalGrams: number;
  remainingGrams: number;
  pricePerTon: string;
  active: boolean;
  openedAt: number;
  evidenceDigest: string;
}

export interface VerifiedFieldCreditDetails {
  sponsor: string;
  projectId: string;
  issuedGrams: number;
  availableGrams: number;
  evidenceDigest: string;
}

/** Read an on-chain evidence record and its currently unlisted balance. */
export async function getVerifiedFieldCreditDetails(
  evidenceDigest: string,
  network: NetworkType
): Promise<VerifiedFieldCreditDetails> {
  if (!/^[a-f0-9]{64}$/.test(evidenceDigest)) {
    throw new Error('evidenceDigest must be a lowercase SHA-256 hex digest');
  }
  const digest = xdr.ScVal.scvBytes(Buffer.from(evidenceDigest, 'hex'));
  const [recordSim, availableSim] = await Promise.all([
    simulate(network, 'get_field_credit', [digest]),
    simulate(network, 'get_field_credit_available', [digest]),
  ]);
  const record = scValToNative(simulationRetval(recordSim)) as Record<string, unknown>;
  return {
    sponsor: String(record.sponsor),
    projectId: String(record.project_id),
    issuedGrams: Number(record.grams),
    availableGrams: Number(scValToNative(simulationRetval(availableSim))),
    evidenceDigest,
  };
}

/** Returns active retail lots that have a field-issuance evidence digest. */
export async function listVerifiedFieldRetailLots(
  network: NetworkType,
  maxLots = 100
): Promise<VerifiedFieldRetailLot[]> {
  const countSim = await simulate(network, 'retail_lot_count', []);
  const count = Number(scValToNative(simulationRetval(countSim)));
  if (!Number.isSafeInteger(count) || count <= 0) return [];

  const cappedCount = Math.min(Math.max(maxLots, 1), 100);
  const firstId = Math.max(1, count - cappedCount + 1);
  const ids = Array.from({ length: count - firstId + 1 }, (_, index) => firstId + index).reverse();
  const lots: VerifiedFieldRetailLot[] = [];
  for (let offset = 0; offset < ids.length; offset += 5) {
    const batch = await Promise.all(
      ids.slice(offset, offset + 5).map(async (id) => {
        const [lotSim, digestSim] = await Promise.all([
          simulate(network, 'get_retail_lot', [nativeToScVal(BigInt(id), { type: 'u64' })]),
          simulate(network, 'get_field_retail_lot_digest', [
            nativeToScVal(BigInt(id), { type: 'u64' }),
          ]),
        ]);
        const lot = scValToNative(simulationRetval(lotSim)) as Record<string, unknown>;
        const rawDigest = scValToNative(simulationRetval(digestSim)) as Uint8Array | null;
        if (!rawDigest || lot.active !== true) return null;
        return {
          id: Number(lot.id),
          projectId: String(lot.project_id),
          seller: String(lot.seller),
          totalGrams: Number(lot.total),
          remainingGrams: Number(lot.remaining),
          pricePerTon: String(lot.price_per_ton),
          active: true,
          openedAt: Number(lot.opened_at),
          evidenceDigest: Buffer.from(rawDigest).toString('hex'),
        } satisfies VerifiedFieldRetailLot;
      })
    );
    lots.push(...batch.filter((lot): lot is VerifiedFieldRetailLot => lot !== null));
  }
  return lots;
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
