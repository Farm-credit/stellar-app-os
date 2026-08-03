import { NextResponse } from 'next/server';
import { buildPaymentTransaction } from '@/lib/stellar/transaction';
import type { BuildTransactionRequest } from '@/lib/types/payment';
import { withWalletLock } from '@/lib/cache/redlock';
import logger from '@/lib/logger';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as BuildTransactionRequest;
    const { selection, walletPublicKey, network, idempotencyKey } = body;

    if (!selection.projectId || selection.quantity <= 0 || selection.calculatedPrice <= 0) {
      return NextResponse.json({ error: 'Invalid selection' }, { status: 400 });
    }

    if (!walletPublicKey || !network || !idempotencyKey) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    // Prevent nonce collisions by serializing builds per wallet (Redis Redlock)
    // Key: lock:wallet:tx:{publicKey}
    // TTL 15s covers Horizon loadAccount + build time
    // Retry 15 times with jitter prevents tx_bad_seq when same wallet builds concurrently
    const result = await withWalletLock(
      walletPublicKey,
      async () => {
        logger.info('[api:build] Building payment transaction with wallet lock', {
          walletPublicKey,
          projectId: selection.projectId,
          quantity: selection.quantity,
        });
        return buildPaymentTransaction(selection, walletPublicKey, network, idempotencyKey);
      },
      {
        ttlMs: 15_000,
        retryCount: 15,
        retryDelayMs: 100,
      }
    );

    return NextResponse.json(result);
  } catch (error) {
    logger.error('[api:build] Error building transaction', { error });
    const errorMessage = error instanceof Error ? error.message : 'Failed to build transaction';
    const status = errorMessage.includes('acquire lock') ? 409 : 500;
    return NextResponse.json({ error: errorMessage }, { status });
  }
}