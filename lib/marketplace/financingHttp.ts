import { NextResponse } from 'next/server';
import { FinancingError } from '@/lib/marketplace/farmerFinancing';

/** Map a financing failure to the JSON error shape the financing routes use. */
export function financingErrorResponse(error: unknown, fallback: string): NextResponse {
  if (error instanceof FinancingError) {
    return NextResponse.json({ success: false, error: error.message }, { status: error.status });
  }
  return NextResponse.json(
    { success: false, error: error instanceof Error ? error.message : fallback },
    { status: 500 }
  );
}
