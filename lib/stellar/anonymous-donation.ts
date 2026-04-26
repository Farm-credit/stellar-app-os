/**
 * Anonymous donation service.
 *
 * Orchestrates the full anonymous donation flow:
 *   1. Generate Groth16 proof client-side (donor secret never leaves device)
 *   2. Submit proof to /api/transaction/build-anonymous-donation
 *      → on-chain ZK verification + nullifier registration
 *      → 70/30 USDC transaction XDR returned
 *   3. Sign and submit the transaction with the donor's wallet
 *
 * The donor's wallet address is used only for signing the payment — it is
 * never passed to the Soroban verifier contract.
 */

import { generateDonationProof } from '@/lib/zk/proof-generator';
import { signTransactionWithFreighter, signTransactionWithAlbedo } from './signing';
import { submitTransaction } from './transaction';
import type { WalletConnection } from '@/lib/types/wallet';
import type { TransactionStatus } from '@/lib/types/payment';
import type { AnonymousDonationRequest, AnonymousDonationResponse } from '@/lib/zk/types';

export interface AnonymousDonationResult {
  transactionHash: string;
  nullifier: string; // keep client-side for receipt / audit
}

export type StatusCallback = (_status: TransactionStatus) => void; // eslint-disable-line no-unused-vars

/**
 * Process an anonymous donation end-to-end.
 *
 * @param amount       - Donation amount in USD
 * @param donorSecret  - Donor's private secret (stays on device)
 * @param wallet       - Connected wallet (used only for signing)
 * @param idempotencyKey
 * @param onStatusChange - Optional progress callback
 */
export async function processAnonymousDonation(
  amount: number,
  donorSecret: string,
  wallet: WalletConnection,
  idempotencyKey: string,
  onStatusChange?: StatusCallback
): Promise<AnonymousDonationResult> {
  // Step 1: Generate ZK proof client-side
  onStatusChange?.('preparing');

  const salt = crypto.randomUUID();
  // Convert USD to cents for the circuit (integer arithmetic)
  const amountCents = Math.round(amount * 100);

  const { proof, inputs, nullifier } = await generateDonationProof(
    donorSecret,
    amountCents,
    salt
  );

  // Step 2: Submit proof for on-chain verification + get transaction XDR
  const reqBody: AnonymousDonationRequest = {
    proof,
    inputs,
    amount,
    network: wallet.network,
    idempotencyKey,
  };

  const buildRes = await fetch('/api/transaction/build-anonymous-donation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(reqBody),
  });

  if (!buildRes.ok) {
    const err = (await buildRes.json()) as { error: string };
    const code = err.error ?? 'Failed to verify proof';

    if (code === 'INVALID_PROOF') {
      throw new Error('INVALID_PROOF: The generated proof was rejected by the on-chain verifier.');
    }
    if (code === 'NULLIFIER_ALREADY_SPENT') {
      throw new Error('NULLIFIER_ALREADY_SPENT: This proof has already been used.');
    }
    throw new Error(code);
  }

  const { transactionXdr, networkPassphrase } =
    (await buildRes.json()) as AnonymousDonationResponse;

  // Step 3: Sign with donor's wallet
  onStatusChange?.('signing');

  let signedXdr: string;
  if (wallet.type === 'freighter') {
    signedXdr = await signTransactionWithFreighter(transactionXdr, networkPassphrase);
  } else if (wallet.type === 'albedo') {
    signedXdr = await signTransactionWithAlbedo(transactionXdr, wallet.network);
  } else {
    throw new Error('Unsupported wallet type for signing');
  }

  // Step 4: Submit to Stellar network
  onStatusChange?.('submitting');

  const transactionHash = await submitTransaction(signedXdr, wallet.network);

  onStatusChange?.('confirming');

  return { transactionHash, nullifier };
}
