/**
 * Soroban RPC client for the XLM cross-chain bridge contract (#1093).
 *
 * Enables purchasing tree sponsorships using wrapped XLM on other
 * Stellar-compatible chains: the user locks XLM on Stellar via
 * `lock_for_purchase`, and the bridge operator executes the tree purchase
 * through the tree-escrow contract (`execute_purchase`).
 *
 * Read calls (config, lock, quote) simulate only — no submission needed.
 * User writes (`lockForPurchase`) are signed with the user's wallet.
 * Admin writes (`executePurchase`, `cancelLock`, …) are signed server-side
 * with the platform fee-payer keypair (STELLAR_FEE_PAYER_SECRET).
 */

import {
  Address,
  Contract,
  Keypair,
  Networks,
  Operation,
  SorobanRpc,
  TransactionBuilder,
  nativeToScVal,
  scValToNative,
  xdr,
} from '@stellar/stellar-sdk';
import { signTransactionWithFreighter, signTransactionWithAlbedo } from './signing';
import type { NetworkType } from '@/lib/types/wallet';

// ── Config ────────────────────────────────────────────────────────────────────

const SOROBAN_RPC: Record<NetworkType, string> = {
  testnet: 'https://soroban-testnet.stellar.org',
  mainnet: 'https://soroban-mainnet.stellar.org',
};

function getNetworkPassphrase(network: NetworkType): string {
  return network === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET;
}

export function getBridgeContractId(network: NetworkType): string {
  const id = process.env.NEXT_PUBLIC_CONTRACT_XLM_BRIDGE;
  if (!id) throw new Error('NEXT_PUBLIC_CONTRACT_XLM_BRIDGE is not set');
  return id;
}

// ── Types (mirrors contracts/xlm-bridge/src/lib.rs) ──────────────────────────

export type BridgeLockStatus = 'Locked' | 'Executed' | 'Cancelled';

export interface BridgeLock {
  id: number;
  sender: string;
  recipient: string;
  farmer: string;
  amount: string;
  treeCount: string;
  areaHectares: string;
  sourceChain: string;
  sourceSender: string;
  feePaid: string;
  lockedAt: number;
  status: BridgeLockStatus;
  treesBought: string;
}

export interface BridgeConfig {
  admin: string;
  xlm: string;
  treeEscrow: string;
  feeWallet: string;
  feeBps: number;
  paused: boolean;
  lockCount: number;
}

export interface LockForPurchaseParams {
  senderAddress: string;
  recipient: string;
  farmer: string;
  /** Amount in stroops. */
  amount: string;
  treeCount: string;
  areaHectares: string;
  sourceChain: string;
  sourceSender: string;
  walletType: 'freighter' | 'albedo';
}

// ── Internals ────────────────────────────────────────────────────────────────

function addr(v: string): xdr.ScVal {
  return nativeToScVal(Address.fromString(v), { type: 'address' });
}

function statusToScVal(status: BridgeLockStatus): xdr.ScVal {
  const variant = xdr.ScVal.scvVec([
    xdr.ScVal.scvSymbol(
      status === 'Locked' ? 'Locked' : status === 'Executed' ? 'Executed' : 'Cancelled',
    ),
  ]);
  return variant;
}

function lockFromScVal(v: ReturnType<typeof scValToNative>): BridgeLock {
  return {
    id: Number(v.id),
    sender: v.sender,
    recipient: v.recipient,
    farmer: v.farmer,
    amount: String(v.amount),
    treeCount: String(v.tree_count),
    areaHectares: String(v.area_hectares),
    sourceChain: v.source_chain,
    sourceSender: v.source_sender,
    feePaid: String(v.fee_paid),
    lockedAt: Number(v.locked_at),
    status: Object.keys(v.status)[0] as BridgeLockStatus,
    treesBought: String(v.trees_bought),
  };
}

async function simulateCall<T>(
  method: string,
  args: xdr.ScVal[],
  network: NetworkType,
  decode: (result: xdr.ScVal) => T,
): Promise<T> {
  const server = new SorobanRpc.Server(SOROBAN_RPC[network], { allowHttp: false });
  const source = Keypair.random().publicKey();

  const tx = new TransactionBuilder(new Address(source).toString(), {
    fee: '100',
    networkPassphrase: getNetworkPassphrase(network),
  })
    .addOperation(new Contract(getBridgeContractId(network)).call(method, ...args))
    .setTimeout(30)
    .build();

  const simulated = await server.simulateTransaction(tx);
  if (SorobanRpc.Api.isSimulationError(simulated)) {
    throw new Error(`Bridge ${method} simulation failed: ${simulated.error}`);
  }
  return decode(simulated.result!.retval);
}

async function submitSigned(
  method: string,
  args: xdr.ScVal[],
  network: NetworkType,
  signAndSend: (xdr: string) => Promise<string>,
): Promise<string> {
  const server = new SorobanRpc.Server(SOROBAN_RPC[network], { allowHttp: false });
  const contract = new Contract(getBridgeContractId(network));

  // Build with a placeholder source; the wallet re-signs the final XDR.
  const source = Keypair.random().publicKey();
  const tx = new TransactionBuilder(source, {
    fee: '500',
    networkPassphrase: getNetworkPassphrase(network),
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(120)
    .build();

  const simResult = await server.simulateTransaction(tx);
  if (SorobanRpc.Api.isSimulationError(simResult)) {
    throw new Error(`Bridge ${method} simulation failed: ${simResult.error}`);
  }
  const prepared = SorobanRpc.assembleTransaction(tx, simResult).build();
  const signedXdr = await signAndSend(prepared.toXDR());

  const result = await server.sendTransaction(
    SorobanRpc.TransactionBuilder.fromXDR(signedXdr, getNetworkPassphrase(network)),
  );
  if (result.status === 'ERROR') {
    throw new Error(`Bridge ${method} submission failed: ${JSON.stringify(result.errorResult)}`);
  }
  return result.hash;
}

async function submitAdmin(
  method: string,
  args: xdr.ScVal[],
  network: NetworkType,
): Promise<string> {
  const secret = process.env.STELLAR_FEE_PAYER_SECRET;
  if (!secret) throw new Error('STELLAR_FEE_PAYER_SECRET is not set');
  const keypair = Keypair.fromSecret(secret);
  const server = new SorobanRpc.Server(SOROBAN_RPC[network], { allowHttp: false });

  const account = await server.loadAccount(keypair.publicKey());
  const tx = new TransactionBuilder(account, {
    fee: '500',
    networkPassphrase: getNetworkPassphrase(network),
  })
    .addOperation(new Contract(getBridgeContractId(network)).call(method, ...args))
    .setTimeout(120)
    .build();
  tx.sign(keypair);

  const result = await server.sendTransaction(tx);
  if (result.status === 'ERROR') {
    throw new Error(`Bridge ${method} submission failed: ${JSON.stringify(result.errorResult)}`);
  }
  return result.hash;
}

// ── User calls ───────────────────────────────────────────────────────────────

/**
 * Lock native XLM for a cross-chain tree sponsorship purchase. Signed with
 * the user's wallet; returns the submitted transaction hash.
 */
export async function lockForPurchase(
  params: LockForPurchaseParams,
  network: NetworkType,
): Promise<string> {
  const args = [
    addr(params.senderAddress),
    addr(params.recipient),
    addr(params.farmer),
    nativeToScVal(BigInt(params.amount), { type: 'i128' }),
    nativeToScVal(BigInt(params.treeCount), { type: 'i128' }),
    nativeToScVal(BigInt(params.areaHectares), { type: 'i128' }),
    nativeToScVal(params.sourceChain, { type: 'string' }),
    nativeToScVal(params.sourceSender, { type: 'string' }),
  ];

  const sign =
    params.walletType === 'freighter'
      ? (x: string) => signTransactionWithFreighter(x, getNetworkPassphrase(network))
      : (x: string) => signTransactionWithAlbedo(x, network);

  return submitSigned('lock_for_purchase', args, network, sign);
}

// ── Admin calls (server-side) ────────────────────────────────────────────────

/** Execute the purchase for a lock through the tree-escrow contract. */
export function executePurchase(lockId: number, network: NetworkType): Promise<string> {
  return submitAdmin('execute_purchase', [nativeToScVal(lockId, { type: 'u64' })], network);
}

/** Cancel a lock and refund the original sender. */
export function cancelLock(lockId: number, network: NetworkType): Promise<string> {
  return submitAdmin('cancel_lock', [nativeToScVal(lockId, { type: 'u64' })], network);
}

/** Update the bridge fee in basis points (max 500). */
export function setBridgeFeeBps(feeBps: number, network: NetworkType): Promise<string> {
  return submitAdmin('set_fee_bps', [nativeToScVal(feeBps, { type: 'i128' })], network);
}

/** Pause or unpause the bridge. */
export function setBridgePaused(paused: boolean, network: NetworkType): Promise<string> {
  return submitAdmin('set_paused', [nativeToScVal(paused, { type: 'bool' })], network);
}

/** Point the bridge at a (re)deployed tree-escrow contract. */
export function setBridgeTreeEscrow(escrow: string, network: NetworkType): Promise<string> {
  return submitAdmin('set_tree_escrow', [addr(escrow)], network);
}

// ── Read calls ───────────────────────────────────────────────────────────────

/** Returns the on-chain bridge configuration. */
export async function getBridgeConfig(network: NetworkType): Promise<BridgeConfig> {
  return simulateCall('get_config', [], network, (scv) => {
    const v = scValToNative(scv);
    return {
      admin: v.admin,
      xlm: v.xlm,
      treeEscrow: v.tree_escrow,
      feeWallet: v.fee_wallet,
      feeBps: Number(v.fee_bps),
      paused: v.paused,
      lockCount: Number(v.lock_count),
    };
  });
}

/** Returns a lock by id, or null when it does not exist. */
export async function getBridgeLock(
  lockId: number,
  network: NetworkType,
): Promise<BridgeLock | null> {
  return simulateCall(
    'get_lock',
    [nativeToScVal(lockId, { type: 'u64' })],
    network,
    (scv) => {
      const v = scValToNative(scv);
      // The contract returns None → empty vec → null.
      if (v === null || v === undefined) return null;
      return lockFromScVal(v);
    },
  );
}

/** Returns all lock ids created by the given sender. */
export async function getLocksForSender(
  sender: string,
  network: NetworkType,
): Promise<number[]> {
  return simulateCall('get_locks_for_sender', [addr(sender)], network, (scv) =>
    (scValToNative(scv) as unknown[]).map(Number),
  );
}

/** Returns the bridge fee (stroops) that would be charged for `amount`. */
export function quoteBridgeFee(amount: string, network: NetworkType): Promise<string> {
  return simulateCall(
    'quote_fee',
    [nativeToScVal(BigInt(amount), { type: 'i128' })],
    network,
    (scv) => String(scValToNative(scv)),
  );
}

/** Re-exported for UI consumption of the status enum mapping. */
export const bridgeStatusToScVal = statusToScVal;
