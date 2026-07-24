import { NextResponse } from 'next/server';
import type { NdviSubmissionRequest, NdviSubmissionResponse } from '@/lib/types/oracle';
import { submitNdviSurvival } from '@/lib/oracle/oracle-client';

export async function POST(request: Request) {
  let body: NdviSubmissionRequest;
  try {
    body = (await request.json()) as NdviSubmissionRequest;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  try {
    const result: NdviSubmissionResponse = await submitNdviSurvival(body);
    return NextResponse.json(result, { status: result.outcome === 'completed' ? 200 : 202 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'submission failed';
    if (msg === 'ORACLE_SIGNATURE_INVALID') {
      return NextResponse.json({ error: 'ORACLE_SIGNATURE_INVALID' }, { status: 401 });
    }
    if (msg === 'UNSUPPORTED_NETWORK') {
      return NextResponse.json({ error: 'UNSUPPORTED_NETWORK' }, { status: 400 });
    }
    console.error('NDVI submission error:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
