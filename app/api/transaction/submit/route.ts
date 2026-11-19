import { NextResponse } from 'next/server';
import { submitTransaction } from '@/lib/stellar/transaction';
import { Transaction } from '@stellar/stellar-sdk';
import { networkConfig } from '@/lib/config/network';
import { withWalletLock } from '@/lib/cache/redlock';
import logger from '@/lib/logger';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      signedTransactionXdr: string;
      network: 'testnet' | 'mainnet';
      sourcePublicKey?: string;
    };

    const { signedTransactionXdr, network, sourcePublicKey } = body;

    if (!signedTransactionXdr || !network) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    // Try to extract source account from XDR for per-wallet serialization on submit
    // This helps prevent race between concurrent submissions for same wallet
    let walletToLock: string | null = sourcePublicKey ?? null;

    if (!walletToLock) {
      try {
        const tx = new Transaction(signedTransactionXdr, networkConfig.networkPassphrase);
        walletToLock = tx.source;
      } catch {
        // If we can't parse, proceed without lock (will submit anyway)
        logger.warn('[api:submit] Could not parse source from XDR, submitting without wallet lock');
      }
    }

    const submitFn = async () => {
      const hash = await submitTransaction(signedTransactionXdr, network);
      logger.info('[api:submit] Transaction submitted', {
        transactionHash: hash,
        source: walletToLock,
      });
      return hash;
    };

    let transactionHash: string;
    if (walletToLock) {
      transactionHash = await withWalletLock(walletToLock, submitFn, {
        ttlMs: 10_000,
        retryCount: 5,
      });
    } else {
      transactionHash = await submitFn();
    }

    return NextResponse.json({ transactionHash });
  } catch (error) {
    logger.error('[api:submit] Error submitting transaction', { error });
    const errorMessage = error instanceof Error ? error.message : 'Failed to submit transaction';
    // Handle bad sequence due to nonce collision - suggest retry
    if (errorMessage.includes('tx_bad_seq') || errorMessage.includes('bad_seq')) {
      return NextResponse.json(
        {
          error: 'Sequence collision (tx_bad_seq). Please rebuild transaction and retry.',
          code: 'TX_BAD_SEQ',
        },
        { status: 409 }
      );
    }
    const status = errorMessage.includes('acquire lock') ? 409 : 500;
    return NextResponse.json({ error: errorMessage }, { status });
  }
}
