import { type NextRequest, NextResponse } from 'next/server';
import { getTaxExemptReceiptById, verifyReceiptDigest } from '@/lib/sponsor-receipts';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/sponsor/receipts/[id]
 * Retrieves a single receipt and its cryptographic verification status.
 */
export async function GET(_request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const receipt = getTaxExemptReceiptById(id);

    if (!receipt) {
      console.warn(`[sponsor-receipts-api] Receipt not found: ${id}`);
      return NextResponse.json(
        { error: `Tax-exempt receipt '${id}' not found.` },
        { status: 404 }
      );
    }

    const isDigestValid = verifyReceiptDigest(receipt);

    return NextResponse.json({
      receipt,
      verification: {
        isDigestValid,
        verifiedAt: receipt.audit.verifiedAt,
        auditor: receipt.audit.auditor,
        explorerUrl: receipt.audit.explorerUrl,
      },
    });
  } catch (error) {
    console.warn('[sponsor-receipts-api] Failed to fetch receipt:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve tax-exempt receipt.' },
      { status: 500 }
    );
  }
}
