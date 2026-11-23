import { NextResponse } from 'next/server';
import { z } from 'zod';

const instructionSchema = z.object({
  id: z.string().min(1),
  asset: z.enum(['USDC', 'XLM']),
  amount: z.string().regex(/^(?:0|[1-9]\d*)(?:\.\d+)?$/),
  escrowAddress: z.string().trim().min(1),
  memo: z.string().max(28),
});

const requestSchema = z.object({ instructions: z.array(instructionSchema).min(1).max(50) });

/**
 * Validates a corporate funding batch before the client hands each prepared
 * instruction to the connected Stellar wallet. Signing remains client-side;
 * this endpoint never receives secret keys or submits transactions.
 */
export async function POST(request: Request) {
  try {
    const body = requestSchema.parse(await request.json());
    return NextResponse.json({
      batchId: `endowment-${crypto.randomUUID()}`,
      transactionHashes: body.instructions.map((instruction) => `pending:${instruction.id}`),
      instructions: body.instructions,
    });
  } catch {
    return NextResponse.json({ error: 'Invalid endowment funding batch.' }, { status: 400 });
  }
}
