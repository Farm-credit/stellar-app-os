import { NextResponse } from 'next/server';
import { FinancingError, applyForCreditLine, listCreditLines } from '@/lib/api/farmer-financing';
import type { ApplyForCreditLineInput } from '@/lib/types/farmer-financing';

export const runtime = 'nodejs';

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

/** GET /api/farmer-financing — list credit lines (filters: farmerId, status). */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const creditLines = listCreditLines({
    farmerId: searchParams.get('farmerId') ?? undefined,
    status: searchParams.get('status') ?? undefined,
  });
  return NextResponse.json({ success: true, totalCount: creditLines.length, creditLines });
}

/** POST /api/farmer-financing — apply for a 0% land-prep credit line. */
export async function POST(request: Request) {
  try {
    let body: ApplyForCreditLineInput;
    try {
      body = (await request.json()) as ApplyForCreditLineInput;
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
    }
    const creditLine = applyForCreditLine(body);
    return NextResponse.json({ success: true, creditLine }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
