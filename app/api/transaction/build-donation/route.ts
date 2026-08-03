import { NextResponse } from 'next/server';
import { buildDonationTransaction, MAX_BATCH_TREES } from '@/lib/stellar/transaction';
import { calculateDonationAllocation } from '@/lib/constants/donation';
import type { BuildDonationTransactionRequest } from '@/lib/types/donation-payment';
import { withWalletLock } from '@/lib/cache/redlock';
import logger from '@/lib/logger';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as BuildDonationTransactionRequest & {
      regionId?: string;
      slippageTolerance?: number;
      asset?: 'USDC' | 'XLM';
    };

    const {
      amount,
      walletPublicKey,
      network,
      idempotencyKey,
      treeCount = 1,
      asset = 'USDC',
      slippageTolerance,
      regionId,
    } = body;

    if (!amount || amount <= 0) {
      return NextResponse.json({ error: 'Invalid donation amount' }, { status: 400 });
    }

    if (!walletPublicKey || !network || !idempotencyKey) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    if (treeCount < 1 || treeCount > MAX_BATCH_TREES) {
      return NextResponse.json(
        { error: `Tree count must be between 1 and ${MAX_BATCH_TREES}` },
        { status: 400 }
      );
    }

    if (asset !== 'USDC' && asset !== 'XLM') {
      return NextResponse.json({ error: 'Unsupported asset (expected USDC or XLM)' }, { status: 400 });
    }

    // Serialize per-wallet transaction building to prevent sequence/nonce collisions
    const result = await withWalletLock(
      walletPublicKey,
      async () => {
        logger.info('[api:build-donation] Building donation tx with wallet lock', {
          walletPublicKey,
          amount,
          treeCount,
          asset,
          regionId,
        });
        return buildDonationTransaction(
          amount,
          walletPublicKey,
          network,
          idempotencyKey,
          treeCount,
          asset,
          slippageTolerance,
          regionId
        );
      },
      {
        ttlMs: 15_000,
        retryCount: 15,
        retryDelayMs: 100,
      }
    );

    const perTreeAllocation = calculateDonationAllocation(amount);
    const allocation = {
      perTree: perTreeAllocation,
      total: {
        total: parseFloat((perTreeAllocation.total * treeCount).toFixed(7)),
        planting: parseFloat((perTreeAllocation.planting * treeCount).toFixed(7)),
        buffer: parseFloat((perTreeAllocation.buffer * treeCount).toFixed(7)),
      },
      treeCount,
    };

    return NextResponse.json({ ...result, allocation });
  } catch (error) {
    logger.error('[api:build-donation] Error building donation transaction', { error });
    const errorMessage = error instanceof Error ? error.message : 'Failed to build transaction';
    // 409 for lock acquisition failures (nonce collision prevention)
    const status = errorMessage.includes('acquire lock') || errorMessage.includes('Failed to acquire') ? 409 : 500;
    return NextResponse.json({ error: errorMessage }, { status });
  }
}
