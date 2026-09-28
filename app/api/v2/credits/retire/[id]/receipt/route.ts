import { NextResponse } from 'next/server';
import { getBlockchainReceiptById } from '@/lib/retirement/receipt';

export const runtime = 'nodejs';

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    if (!id) {
      return NextResponse.json({ error: 'Missing receipt identifier' }, { status: 400 });
    }

    const receipt = getBlockchainReceiptById(id);

    if (!receipt) {
      return NextResponse.json(
        { error: `Retirement blockchain receipt with ID or hash '${id}' was not found.` },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      receipt,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal Server Error' },
      { status: 500 }
    );
  }
}
