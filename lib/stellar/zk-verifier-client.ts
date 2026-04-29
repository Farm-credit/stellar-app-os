/**
 * Soroban RPC client for the ZkVerifier contract (Circuit 1).
 *
 * Invokes `verify_proof` on-chain, which atomically:
 *   1. Verifies the Groth16 proof against the embedded VK
 *   2. Checks the nullifier is not already spent
 *   3. Records the nullifier in persistent storage
 *
 * The donor's wallet address is never passed to the contract.
 */

import {
  Contract,
  Networks,
  SorobanRpc,
  TransactionBuilder,
  xdr,
  nativeToScVal,
  scValToNative,
  Address,
} from '@stellar/stellar-sdk';
import type { NetworkType } from '@/lib/types/wallet';
import type { ZkProof, ProofInputs } from '@/lib/zk/types';

// ── Config ────────────────────────────────────────────────────────────────────

const SOROBAN_RPC: Record<NetworkType, string> = {
  testnet: 'https://soroban-testnet.stellar.org',
  mainnet: 'https://soroban-mainnet.stellar.org',
};

function getContractId(network: NetworkType): string {
  const id =
    network === 'mainnet'
      ? process.env.ZK_VERIFIER_CONTRACT_MAINNET
      : process.env.ZK_VERIFIER_CONTRACT_TESTNET;

  if (!id) {
    throw new Error(
      `ZK_VERIFIER_CONTRACT_${network.toUpperCase()} environment variable is not set`
    );
  }
  return id;
}

function getNetworkPassphrase(network: NetworkType): string {
  return network === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET;
}

// ── XDR encoding helpers ──────────────────────────────────────────────────────

/** Encode a hex string as a Soroban BytesN ScVal. */
function hexToScBytesN(hex: string): xdr.ScVal {
  const bytes = Buffer.from(hex, 'hex');
  return xdr.ScVal.scvBytes(bytes);
}

/**
 * Encode a ZkProof as a Soroban struct ScVal matching the contract's
 * `ZkProof { a: BytesN<64>, b: BytesN<128>, c: BytesN<64> }` type.
 */
function encodeProof(proof: ZkProof): xdr.ScVal {
  return xdr.ScVal.scvMap([
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol('a'),
      val: hexToScBytesN(proof.a),
    }),
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol('b'),
      val: hexToScBytesN(proof.b),
    }),
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol('c'),
      val: hexToScBytesN(proof.c),
    }),
  ]);
}

/**
 * Encode ProofInputs as a Soroban struct ScVal matching the contract's
 * `ProofInputs { commitment: BytesN<32>, nullifier_hash: BytesN<32> }` type.
 */
function encodeInputs(inputs: ProofInputs): xdr.ScVal {
  return xdr.ScVal.scvMap([
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol('commitment'),
      val: hexToScBytesN(inputs.commitment),
    }),
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol('nullifier_hash'),
      val: hexToScBytesN(inputs.nullifierHash),
    }),
  ]);
}

// ── Contract invocation ───────────────────────────────────────────────────────

/**
 * Invoke `verify_proof` on the ZkVerifier Soroban contract.
 *
 * Uses a server-side keypair (fee-only account) to submit the transaction.
 * The donor's wallet is NOT used here — privacy is preserved.
 *
 * @throws Error with code "INVALID_PROOF" or "NULLIFIER_ALREADY_SPENT" on
 *         contract-level rejection, or a network error message otherwise.
 */
export async function invokeVerifyProof(
  proof: ZkProof,
  inputs: ProofInputs,
  network: NetworkType
): Promise<void> {
  const rpcUrl = SOROBAN_RPC[network];
  const contractId = getContractId(network);
  const networkPassphrase = getNetworkPassphrase(network);

  const server = new SorobanRpc.Server(rpcUrl, { allowHttp: false });

  // Use the platform's fee-payer account (server-side key, not the donor's wallet)
  const feePayerSecret = process.env.STELLAR_FEE_PAYER_SECRET;
  if (!feePayerSecret) {
    throw new Error('STELLAR_FEE_PAYER_SECRET environment variable is not set');
  }

  const { Keypair } = await import('@stellar/stellar-sdk');
  const feePayerKeypair = Keypair.fromSecret(feePayerSecret);
  const feePayerPublicKey = feePayerKeypair.publicKey();

  // Load fee-payer account
  const account = await server.getAccount(feePayerPublicKey);

  const contract = new Contract(contractId);

  // Build the transaction invoking verify_proof(proof, inputs)
  const tx = new TransactionBuilder(account, {
    fee: '1000000', // 0.1 XLM — Soroban ops are more expensive
    networkPassphrase,
  })
    .addOperation(
      contract.call('verify_proof', encodeProof(proof), encodeInputs(inputs))
    )
    .setTimeout(30)
    .build();

  // Simulate to get the footprint and resource fees
  const simResult = await server.simulateTransaction(tx);

  if (SorobanRpc.Api.isSimulationError(simResult)) {
    // Extract the contract error code from the simulation result
    const errMsg = simResult.error ?? 'Simulation failed';
    if (errMsg.includes('INVALID_PROOF')) throw new Error('INVALID_PROOF');
    if (errMsg.includes('NULLIFIER_ALREADY_SPENT')) throw new Error('NULLIFIER_ALREADY_SPENT');
    throw new Error(`Soroban simulation error: ${errMsg}`);
  }

  // Assemble the transaction with the simulated footprint
  const preparedTx = SorobanRpc.assembleTransaction(tx, simResult).build();

  // Sign with the fee-payer key
  preparedTx.sign(feePayerKeypair);

  // Submit
  const sendResult = await server.sendTransaction(preparedTx);

  if (sendResult.status === 'ERROR') {
    const errMsg = sendResult.errorResult?.toXDR('base64') ?? 'Unknown error';
    throw new Error(`Transaction submission failed: ${errMsg}`);
  }

  // Poll for confirmation
  const txHash = sendResult.hash;
  await pollForConfirmation(server, txHash);
}

/** Poll until the transaction is confirmed or fails. */
async function pollForConfirmation(
  server: SorobanRpc.Server,
  txHash: string,
  maxAttempts = 20,
  intervalMs = 1500
): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    await sleep(intervalMs);
    const result = await server.getTransaction(txHash);

    if (result.status === SorobanRpc.Api.GetTransactionStatus.SUCCESS) {
      return;
    }
    if (result.status === SorobanRpc.Api.GetTransactionStatus.FAILED) {
      // Try to extract the contract error from the result meta
      const meta = result.resultMetaXdr;
      const errStr = meta ? meta.toXDR('base64') : 'unknown';
      if (errStr.includes('INVALID_PROOF')) throw new Error('INVALID_PROOF');
      if (errStr.includes('NULLIFIER_ALREADY_SPENT')) throw new Error('NULLIFIER_ALREADY_SPENT');
      throw new Error(`Transaction failed: ${errStr}`);
    }
    // NOT_FOUND or PENDING — keep polling
  }
  throw new Error('Transaction confirmation timeout');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
