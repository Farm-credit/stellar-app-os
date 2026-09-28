import { NextResponse } from 'next/server';
import {
  getBulkPurchaseAgreementById,
  updateBulkAgreementStatus,
  type AgreementStatus,
} from '@/lib/marketplace/bulkPurchasing';

export const runtime = 'nodejs';

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const agreement = getBulkPurchaseAgreementById(id);

    if (!agreement) {
      return NextResponse.json(
        { error: `Bulk purchase agreement with ID '${id}' was not found.` },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      agreement,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal Server Error' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const { status } = body;

    const validStatuses: AgreementStatus[] = [
      'draft',
      'proposed',
      'accepted',
      'active',
      'completed',
      'cancelled',
    ];

    if (!validStatuses.includes(status)) {
      return NextResponse.json(
        {
          error: `Invalid status '${status}'. Must be one of: ${validStatuses.join(', ')}`,
        },
        { status: 400 }
      );
    }

    const updated = updateBulkAgreementStatus(id, status);

    return NextResponse.json({
      success: true,
      message: `Agreement status updated to '${status}'.`,
      agreement: updated,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal Server Error' },
      { status: 400 }
    );
  }
}
