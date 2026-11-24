/**
 * /api/v2/marketplace/financing/:id/repayments — Issue #1414
 *
 * GET   Repayment history and outstanding balance of a credit line.
 * POST  Apply a carbon credit sale to the line.
 *       { saleReference: string, saleProceeds: number }
 *       → 201 { success, creditLine, repaymentApplied, farmerPayout }
 *       → 400 invalid sale · 404 unknown line · 409 line not active or sale already applied
 */

import { NextResponse } from 'next/server';
import { getCreditLine, recordCarbonSaleRepayment } from '@/lib/marketplace/farmerFinancing';
import { financingErrorResponse } from '@/lib/marketplace/financingHttp';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const line = getCreditLine(id);
    return NextResponse.json({
      success: true,
      creditLineId: line.id,
      status: line.status,
      outstandingAmount: line.outstandingAmount,
      repaidAmount: line.repaidAmount,
      repayments: line.repayments,
    });
  } catch (error) {
    return financingErrorResponse(error, 'Failed to fetch repayments');
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const result = recordCarbonSaleRepayment(id, {
      saleReference: body?.saleReference,
      saleProceeds: Number(body?.saleProceeds),
    });
    return NextResponse.json({ success: true, ...result }, { status: 201 });
  } catch (error) {
    return financingErrorResponse(error, 'Failed to record repayment');
  }
}
