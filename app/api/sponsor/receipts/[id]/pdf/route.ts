import { type NextRequest, NextResponse } from 'next/server';
import { getTaxExemptReceiptById } from '@/lib/sponsor-receipts';
import { taxExemptReceiptPdfToBuffer } from '@/lib/sponsor-receipt-pdf';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/sponsor/receipts/[id]/pdf
 * Dynamically streams the compiled tax-exempt receipt PDF.
 */
export async function GET(_request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const receipt = getTaxExemptReceiptById(id);

    if (!receipt) {
      console.warn(`[sponsor-receipts-pdf-api] Receipt not found: ${id}`);
      return NextResponse.json(
        { error: `Tax-exempt receipt '${id}' not found.` },
        { status: 404 }
      );
    }

    const pdfBuffer = taxExemptReceiptPdfToBuffer(receipt);
    const filename = `${receipt.benefactor.brandSlug}-tax-exempt-receipt-${receipt.taxYear}-${receipt.receiptNumber}.pdf`;

    return new Response(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (error) {
    console.warn('[sponsor-receipts-pdf-api] Failed to render PDF:', error);
    return NextResponse.json(
      { error: 'Failed to generate receipt PDF export.' },
      { status: 500 }
    );
  }
}
