/**
 * Soroban RPC client for the second milestone — survival verification.
 *
 * Calls `verify_survival(farmer, proof_hash, survival_rate)` on either the
 * tree-escrow or escrow-milestone contract.
 *
 * Contract behaviour:
 *   survival_rate >= 70% → releases remaining 25% to farmer, status = Completed
 *   survival_rate <  70% → status = Disputed, 25% held for manual resolution
 */

import {
  Contract,
  Networks,
  SorobanRpc,
  TransactionBuilder,
  xdr,
  Address,
  Keypair,
} from '@stellar/stellar-sdk';
import type { NetworkType } from '@/lib/types/wallet';

// ── Config ────────────────────────────────────────────────────────────────────

const SOROBAN_RPC: Record<NetworkType, string> = {
  testnet: 'https://soroban-testnet.stellar.org',
  mainnet: 'https://soroban-mainnet.stellar.org',
};

type ContractType = 'tree-escrow' | 'escrow-milestone';

function getContractId(contractType: ContractType, network: NetworkType): string {
  const envKey =
    contractType === 'tree-escrow'
      ? network === 'mainnet'
        ? 'TREE_ESCROW_CONTRACT_MAINNET'
        : 'TREE_ESCROW_CONTRACT_TESTNET'
      : network === 'mainnet'
        ? 'ESCROW_MILESTONE_CONTRACT_MAINNET'
        : 'ESCROW_MILESTONE_CONTRACT_TESTNET';

  const id = process.env[envKey];
  if (!id) throw new Error(`${envKey} environment variable is not set`);
  return id;
}

function getNetworkPassphrase(network: NetworkType): string {
  return network === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET;
}

// ── XDR helpers ───────────────────────────────────────────────────────────────

function addressToScVal(publicKey: string): xdr.ScVal {
  return new Address(publicKey).toScVal();
}

function hexToScBytesN32(hex: string): xdr.ScVal {
  const bytes = Buffer.from(hex, 'hex');
  if (bytes.length !== 32) throw new Error('proofHash must be 32 bytes (64 hex chars)');
  return xdr.ScVal.scvBytes(bytes);
}

function u32ToScVal(n: number): xdr.ScVal {
  return xdr.ScVal.scvU32(n);
}

function boolToScVal(b: boolean): xdr.ScVal {
  return xdr.ScVal.scvBool(b);
}

// ── Fee-payer helper ──────────────────────────────────────────────────────────

function getFeePayerKeypair(): Keypair {
  const secret = process.env.STELLAR_FEE_PAYER_SECRET;
  if (!secret) throw new Error('STELLAR_FEE_PAYER_SECRET environment variable is not set');
  return Keypair.fromSecret(secret);
}

// ── Core invocation ───────────────────────────────────────────────────────────

async function invokeContract(
  network: NetworkType,
  contractType: ContractType,
  method: string,
  args: xdr.ScVal[]
): Promise<string> {
  const rpcUrl = SOROBAN_RPC[network];
  const contractId = getContractId(contractType, network);
  const networkPassphrase = getNetworkPassphrase(network);
  const feePayerKeypair = getFeePayerKeypair();

  const server = new SorobanRpc.Server(rpcUrl, { allowHttp: false });
  const account = await server.getAccount(feePayerKeypair.publicKey());
  const contract = new Contract(contractId);

  const tx = new TransactionBuilder(account, {
    fee: '1000000',
    networkPassphrase,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(30)
    .build();

  const simResult = await server.simulateTransaction(tx);

  if (SorobanRpc.Api.isSimulationError(simResult)) {
    const msg = simResult.error ?? 'Simulation failed';
    throw new Error(msg);
  }

  const preparedTx = SorobanRpc.assembleTransaction(tx, simResult).build();
  preparedTx.sign(feePayerKeypair);

  const sendResult = await server.sendTransaction(preparedTx);
  if (sendResult.status === 'ERROR') {
    throw new Error(`Transaction submission failed: ${sendResult.errorResult?.toXDR('base64') ?? 'unknown'}`);
  }

  await pollForConfirmation(server, sendResult.hash);
  return sendResult.hash;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Invoke `verify_survival` on the escrow contract.
 *
 * Returns the transaction hash. The caller should then read the escrow record
 * to determine whether the outcome was Completed or Disputed.
 */
export async function invokeSurvivalVerification(
  farmerPublicKey: string,
  proofHash: string,
  survivalRate: number,
  contractType: ContractType,
  network: NetworkType
): Promise<string> {
  if (survivalRate < 0 || survivalRate > 100) {
    throw new Error('survivalRate must be between 0 and 100');
  }
  if (proofHash.length !== 64) {
    throw new Error('proofHash must be a 64-char hex string (32 bytes)');
  }

  return invokeContract(network, contractType, 'verify_survival', [
    addressToScVal(farmerPublicKey),
    hexToScBytesN32(proofHash),
    u32ToScVal(survivalRate),
  ]);
}

/**
 * Invoke `resolve_dispute` on the escrow contract.
 * Admin-only — called after manual review of a Disputed escrow.
 */
export async function invokeResolveDispute(
  farmerPublicKey: string,
  releaseToFarmer: boolean,
  contractType: ContractType,
  network: NetworkType
): Promise<string> {
  return invokeContract(network, contractType, 'resolve_dispute', [
    addressToScVal(farmerPublicKey),
    boolToScVal(releaseToFarmer),
  ]);
}

// ── Polling ───────────────────────────────────────────────────────────────────

async function pollForConfirmation(
  server: SorobanRpc.Server,
  txHash: string,
  maxAttempts = 20,
  intervalMs = 1500
): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    await sleep(intervalMs);
    const result = await server.getTransaction(txHash);

    if (result.status === SorobanRpc.Api.GetTransactionStatus.SUCCESS) return;
    if (result.status === SorobanRpc.Api.GetTransactionStatus.FAILED) {
      throw new Error(`Transaction failed: ${result.resultMetaXdr?.toXDR('base64') ?? 'unknown'}`);
    }
  }
  throw new Error('Transaction confirmation timeout');
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
