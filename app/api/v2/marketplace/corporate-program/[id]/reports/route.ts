import { NextRequest, NextResponse } from 'next/server';
import { getCorporateMonthlyReports } from '@/lib/marketplace/corporateOffsetProgram';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const reports = getCorporateMonthlyReports(id);

    return NextResponse.json({
      success: true,
      count: reports.length,
      reports,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch monthly reports' },
      { status: 500 }
    );
  }
}
