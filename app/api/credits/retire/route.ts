import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getPool } from '@/lib/db/client';
import {
  buildRetirementReceipt,
  buildRetirementMemo,
  verifyRetirementReceipt,
} from '@/lib/carbon/retirement-proof';
import logger from '@/lib/logger';

export const runtime = 'nodejs';

const CreateReceiptSchema = z.object({
  retirementKey: z.string().min(8).max(64),
  buyerWallet: z.string().min(40).max(80),
  buyerEmail: z.string().email().optional(),
  creditAmount: z.number().positive(),
  unit: z.string().max(10).optional(),
  projectId: z.string().min(1).max(64),
  projectName: z.string().min(1).max(255),
  projectLocation: z.string().max(255).optional(),
  projectType: z.string().max(50).optional(),
  vintageYear: z.number().int().min(2000).max(2100).optional(),
  coBenefits: z.array(z.string().max(100)).max(20).default([]),
  network: z.enum(['testnet', 'mainnet']),
  txHash: z.string().min(60).max(80),
});

/**
 * POST /api/credits/retire — create an immutable retirement receipt (#1330).
 *
 * Body: { retirementKey, buyerWallet, creditAmount, projectId, projectName,
 *         coBenefits, network, txHash, ... }
 *
 * Returns the receipt with its SHA-256 digest and the short memo that was
 * (or must be) embedded in the retirement transaction. Receipt creation is
 * idempotent per `retirementKey`.
 */
export async function POST(request: Request) {
  try {
    const parsed = CreateReceiptSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const input = parsed.data;

    const pool = getPool();

    // Idempotency: an existing receipt for this key is returned unchanged.
    const existing = await pool.query(
      'SELECT receipt_payload FROM retirement_receipts WHERE retirement_key = $1',
      [input.retirementKey]
    );
    if (existing.rows.length > 0) {
      return NextResponse.json({ receipt: existing.rows[0].receipt_payload, replay: true });
    }

    const receipt = buildRetirementReceipt({
      ...input,
      onChainMemo: buildRetirementMemo(''),
    });
    // Rebuild the memo from the real digest (buildRetirementReceipt hashed
    // the body; the memo must reference the final digest).
    receipt.onChainMemo = buildRetirementMemo(receipt.receiptHash);

    const receiptHash = receipt.receiptHash;
    const onChainMemo = receipt.onChainMemo;

    await pool.query(
      `INSERT INTO retirement_receipts
        (retirement_key, buyer_wallet, buyer_email, credit_amount, unit,
         project_id, project_name, project_location, project_type, vintage_year,
         co_benefits, network, tx_hash, on_chain_memo, receipt_hash, receipt_payload)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,$14,$15,$16::jsonb)`,
      [
        receipt.retirementKey,
        receipt.buyerWallet,
        receipt.buyerEmail ?? null,
        receipt.creditAmount,
        receipt.unit,
        receipt.projectId,
        receipt.projectName,
        receipt.projectLocation ?? null,
        receipt.projectType ?? null,
        receipt.vintageYear ?? null,
        JSON.stringify(receipt.coBenefits),
        receipt.network,
        receipt.txHash,
        onChainMemo,
        receiptHash,
        JSON.stringify(receipt),
      ]
    );

    logger.info('[api:credits:retire] retirement receipt created', {
      retirementKey: input.retirementKey,
      txHash: input.txHash,
      receiptHash,
    });

    return NextResponse.json({ receipt, replay: false }, { status: 201 });
  } catch (error) {
    logger.error('[api:credits:retire] failed to create receipt', { error });
    const message = error instanceof Error ? error.message : 'Failed to create receipt';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * GET /api/credits/retire?hash=<sha256|txHash> — verify a receipt (#1330).
 * Recomputes the digest and reports tampering.
 */
export async function GET(request: Request) {
  try {
    const hash = new URL(request.url).searchParams.get('hash');
    if (!hash) {
      return NextResponse.json({ error: 'Missing hash parameter' }, { status: 400 });
    }

    const pool = getPool();
    const result = await pool.query(
      `SELECT receipt_payload FROM retirement_receipts
       WHERE receipt_hash = $1 OR tx_hash = $1
       LIMIT 1`,
      [hash]
    );
    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Receipt not found' }, { status: 404 });
    }

    const receipt = result.rows[0].receipt_payload;
    const verification = verifyRetirementReceipt(receipt);

    return NextResponse.json({
      receipt,
      verification: {
        ...verification,
        onChainAnchor: {
          network: receipt.network,
          txHash: receipt.txHash,
          memo: receipt.onChainMemo,
          memoMatches: verification.expectedMemo === receipt.onChainMemo,
        },
      },
    });
  } catch (error) {
    logger.error('[api:credits:retire] failed to verify receipt', { error });
    const message = error instanceof Error ? error.message : 'Failed to verify receipt';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
