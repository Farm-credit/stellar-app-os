import { NextResponse } from 'next/server';
import {
  getBlockchainReceiptById,
  verifyBlockchainReceipt,
  type BlockchainProofReceipt,
} from '@/lib/retirement/receipt';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { receiptId, receipt: rawReceipt } = body;

    let targetReceipt: BlockchainProofReceipt | null = null;

    if (receiptId) {
      targetReceipt = getBlockchainReceiptById(receiptId);
      if (!targetReceipt) {
        return NextResponse.json(
          { error: `Receipt with ID '${receiptId}' not found.` },
          { status: 404 }
        );
      }
    } else if (rawReceipt) {
      targetReceipt = rawReceipt as BlockchainProofReceipt;
    } else {
      return NextResponse.json(
        { error: 'Please provide either receiptId or the receipt object to verify.' },
        { status: 400 }
      );
    }

    const verification = verifyBlockchainReceipt(targetReceipt);

    return NextResponse.json({
      verified: verification.isValid,
      receiptId: targetReceipt.receiptId,
      transactionHash: targetReceipt.transactionHash,
      creditsRetired: targetReceipt.creditsRetired,
      project: targetReceipt.project,
      coBenefits: targetReceipt.coBenefits,
      timestamp: targetReceipt.timestamp,
      verification,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Verification failed' },
      { status: 500 }
    );
  }
}
