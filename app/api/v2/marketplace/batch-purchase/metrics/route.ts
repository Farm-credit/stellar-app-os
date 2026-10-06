import { NextResponse } from 'next/server';
import { getBatchExecutionMetrics } from '@/lib/marketplace/transactionBatcher';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const metrics = getBatchExecutionMetrics();
    return NextResponse.json({
      success: true,
      metrics,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal Server Error' },
      { status: 500 }
    );
  }
}
