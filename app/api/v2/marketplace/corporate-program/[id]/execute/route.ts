import { NextRequest, NextResponse } from 'next/server';
import { executeAutomatedOffsetRun } from '@/lib/marketplace/corporateOffsetProgram';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const result = executeAutomatedOffsetRun(id);

    return NextResponse.json({
      success: true,
      message: `Automated offset purchase and retirement successfully executed on Stellar`,
      execution: result.execution,
      report: result.report,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to execute automated offset run' },
      { status: 400 }
    );
  }
}
