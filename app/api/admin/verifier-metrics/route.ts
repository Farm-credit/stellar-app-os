import { NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/auth/admin';
import { getPool } from '@/lib/db/client';
import { getVerifierPerformanceReport } from '@/lib/verifier/performance';

export const runtime = 'nodejs';

export async function GET() {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const report = await getVerifierPerformanceReport(
      getPool(),
      process.env.VERIFIER_STAKING_CONTRACT_ID
    );
    return NextResponse.json(report, {
      headers: { 'Cache-Control': 'private, max-age=60, stale-while-revalidate=300' },
    });
  } catch (error) {
    console.error('[verifier-metrics] Could not load performance data:', error);
    return NextResponse.json(
      { error: 'Could not load verifier performance data.' },
      { status: 500 }
    );
  }
}
