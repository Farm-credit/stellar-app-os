import type { WalletConnection } from '@/lib/types/wallet';
import type { TransactionStatus } from '@/lib/types/payment';
import type { BuildDonationTransactionResponse } from '@/lib/types/donation-payment';
import { signTransactionWithFreighter, signTransactionWithAlbedo } from './signing';

export interface DonationPaymentResult {
  transactionHash: string;
}

export type DonationStatusCallback = (_status: TransactionStatus) => void; // eslint-disable-line no-unused-vars

export async function processDonationPayment(
  amount: number,
  wallet: WalletConnection,
  idempotencyKey: string,
  onStatusChange?: DonationStatusCallback
): Promise<DonationPaymentResult> {
  // Step 1: Build transaction
  onStatusChange?.('preparing');

  const buildRes = await fetch('/api/transaction/build-donation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      amount,
      walletPublicKey: wallet.publicKey,
      network: wallet.network,
      idempotencyKey,
    }),
  });

  if (!buildRes.ok) {
    const err = (await buildRes.json()) as { error: string };
    throw new Error(err.error || 'Failed to build transaction');
  }

  const { transactionXdr, networkPassphrase } =
    (await buildRes.json()) as BuildDonationTransactionResponse;

  // Step 2: Sign transaction
  onStatusChange?.('signing');

  let signedXdr: string;
  if (wallet.type === 'freighter') {
    signedXdr = await signTransactionWithFreighter(transactionXdr, networkPassphrase);
  } else if (wallet.type === 'albedo') {
    signedXdr = await signTransactionWithAlbedo(transactionXdr, wallet.network);
  } else {
    throw new Error('Unsupported wallet type for signing');
  }

  // Step 3: Submit transaction
  onStatusChange?.('submitting');

  const submitRes = await fetch('/api/transaction/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      signedTransactionXdr: signedXdr,
      network: wallet.network,
    }),
  });

  if (!submitRes.ok) {
    const err = (await submitRes.json()) as { error: string };
    throw new Error(err.error || 'Failed to submit transaction');
  }

  const { transactionHash } = (await submitRes.json()) as { transactionHash: string };

  onStatusChange?.('confirming');

  return { transactionHash };
}
