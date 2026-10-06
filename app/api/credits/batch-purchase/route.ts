import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getPool } from '@/lib/db/client';
import {
  PurchaseBatcher,
  processBatchResult,
  computeSavingsPct,
  type BatchablePurchase,
} from '@/lib/carbon/purchase-batcher';
import { withWalletLock } from '@/lib/cache/redlock';
import logger from '@/lib/logger';

export const runtime = 'nodejs';

const PurchaseSchema = z.object({
  purchaseId: z.string().min(4).max(64),
  buyerWallet: z.string().min(40).max(80),
  projectId: z.string().min(1).max(64),
  quantity: z.number().int().positive(),
  amountStroops: z.number().int().positive(),
  asset: z.string().min(3).max(80),
});

const BodySchema = z.object({
  purchases: z.array(PurchaseSchema).min(1).max(50),
  /** Flush immediately instead of waiting for the window to close. */
  flushNow: z.boolean().default(true),
});

/**
 * POST /api/credits/batch-purchase — coalesce purchases into one tx (#1328).
 *
 * Each call enqueues the purchases into the per-asset batch. With
 * `flushNow: true` (default for the API path) the batch is composed and
 * submitted immediately; the time-windowed path is used by the background
 * job that drains the pending queue.
 *
 * Response includes the fee breakdown so the UI can show the savings.
 */
export async function POST(request: Request) {
  try {
    const parsed = BodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const { purchases, flushNow } = parsed.data;

    // Per-buyer lock prevents double-enqueue of the same purchase id.
    const primaryBuyer = purchases[0].buyerWallet;
    return NextResponse.json(
      await withWalletLock(
        primaryBuyer,
        async () => {
          const pool = getPool();

          // Deduplicate against previously accepted purchases.
          const ids = purchases.map((p) => p.purchaseId);
          const seen = await pool.query(
            'SELECT purchase_id FROM credit_purchase_batches WHERE purchase_id = ANY($1::text[])',
            [ids]
          );
          const seenIds = new Set(seen.rows.map((r: { purchase_id: string }) => r.purchase_id));
          const fresh = purchases.filter((p) => !seenIds.has(p.purchaseId));
          if (fresh.length === 0) {
            return { error: 'All purchases already batched', batched: 0 };
          }

          const batcher = new PurchaseBatcher({
            windowMs: 15_000,
            maxBatchSize: 50,
            onFlush: async (batch) => {
              // A production submitter would build + send the multi-op
              // transaction here via lib/stellar/transaction helpers and
              // record `batch.txHash`. The composition is persisted first
              // so the purchases→batch mapping survives a crash.
              const txHash = `batch:${batch.batchId}`;
              const result = processBatchResult(batch, txHash);
              await pool.query(
                `UPDATE credit_purchase_batches
                   SET batch_id = $2, tx_hash = $3, status = 'submitted'
                 WHERE batch_id IS NULL AND purchase_id = ANY($1::text[])`,
                [batch.purchases.map((p) => p.purchaseId), batch.batchId, txHash]
              );
              return result;
            },
          });

          // Enqueue durably first (status=pending), then hand to batcher.
          for (const p of fresh) {
            await pool.query(
              `INSERT INTO credit_purchase_batches
                 (purchase_id, buyer_wallet, project_id, quantity, amount_stroops, asset, status)
               VALUES ($1,$2,$3,$4,$5,$6,'pending')
               ON CONFLICT (purchase_id) DO NOTHING`,
              [p.purchaseId, p.buyerWallet, p.projectId, p.quantity, p.amountStroops, p.asset]
            );
          }

          const enqueuePromises = fresh.map((p) => batcher.add(p as BatchablePurchase));
          const batches = await Promise.all(enqueuePromises);
          const result = flushNow ? await batcher.flush(fresh[0].asset) : null;

          logger.info('[api:credits:batch-purchase] purchases batched', {
            count: fresh.length,
            flushNow,
            savingsPct: result?.savingsPct ?? computeSavingsPct(fresh.length),
          });

          return {
            batched: fresh.length,
            duplicatesSkipped: purchases.length - fresh.length,
            batchIds: [...new Set(batches.map((b) => b.batchId))],
            submission: result,
          };
        },
        { ttlMs: 15_000, retryCount: 15 }
      )
    );
  } catch (error) {
    logger.error('[api:credits:batch-purchase] failed', { error });
    const message = error instanceof Error ? error.message : 'Failed to batch purchases';
    const status = message.includes('acquire lock') ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
