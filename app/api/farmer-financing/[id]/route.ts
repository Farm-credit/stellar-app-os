import { NextResponse } from 'next/server';
import {
  FinancingError,
  approveCreditLine,
  disburseCreditLine,
  getCreditLine,
  recordCarbonSale,
  rejectCreditLine,
} from '@/lib/api/farmer-financing';
import type { RecordCarbonSaleInput } from '@/lib/types/farmer-financing';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

function errorResponse(error: unknown): NextResponse {
  if (error instanceof FinancingError) {
    return NextResponse.json(
      { success: false, error: error.message, code: error.code },
      { status: error.status }
    );
  }
  return NextResponse.json(
    { success: false, error: 'Unexpected financing error' },
    { status: 500 }
  );
}

/** GET /api/farmer-financing/:id */
export async function GET(_request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    return NextResponse.json({ success: true, creditLine: getCreditLine(id) });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * POST /api/farmer-financing/:id
 *
 * Body `{ action: 'approve' | 'reject' | 'disburse' }` advances the credit
 * line; `{ action: 'carbon_sale', saleId, proceedsUsd }` repays it from a
 * carbon credit sale.
 */
export async function POST(request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    let body: ({ action?: string } & Partial<RecordCarbonSaleInput>) | null;
    try {
      body = await request.json();
    } catch {
      body = null;
    }
    if (!body) {
      return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
    }

    switch (body.action) {
      case 'approve':
        return NextResponse.json({ success: true, creditLine: approveCreditLine(id) });
      case 'reject':
        return NextResponse.json({ success: true, creditLine: rejectCreditLine(id) });
      case 'disburse':
        return NextResponse.json({ success: true, creditLine: disburseCreditLine(id) });
      case 'carbon_sale':
        return NextResponse.json({
          success: true,
          ...recordCarbonSale(id, body as RecordCarbonSaleInput),
        });
      default:
        return NextResponse.json({ success: false, error: 'Unknown action' }, { status: 400 });
    }
  } catch (error) {
    return errorResponse(error);
  }
}
