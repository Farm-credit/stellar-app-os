/**
 * Tree Census Stats Endpoint — GET /api/v1/census/stats
 *
 * Retrieves current survival rate, average height, health score, and historical census results.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getProjectCensusStats, listCensusSubmissions } from '@/lib/census/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId') || searchParams.get('project') || 'proj-001';

  const stats = getProjectCensusStats(projectId);
  const submissions = listCensusSubmissions(projectId);

  return NextResponse.json({
    stats,
    submissions: submissions.map((s) => ({
      id: s.id,
      censusYear: s.censusYear,
      totalTreesCounted: s.totalTreesCounted,
      survivalRate: s.survivalRate,
      averageHealthScore: s.averageHealthScore,
      averageHeightCm: s.averageHeightCm,
      submittedAt: s.submittedAt,
    })),
  });
}
