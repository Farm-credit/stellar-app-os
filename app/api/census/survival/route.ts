import { type NextRequest, NextResponse } from 'next/server';

import { getProjectSurvivalStatistic, getSpeciesSurvivalStatistic } from '@/lib/census/survival';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/census/survival
 *
 * Survival rate statistics (issue #1645):
 *   ?projectId=proj-001                 → project-level figure
 *   ?species=teak&name=Teak             → species-level figure
 */
export function GET(req: NextRequest): NextResponse {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId');
  const species = searchParams.get('species');

  if (projectId) {
    return NextResponse.json({ statistic: getProjectSurvivalStatistic(projectId) });
  }

  if (species) {
    const name = searchParams.get('name') ?? species;
    return NextResponse.json({
      statistic: getSpeciesSurvivalStatistic({ slug: species, name }),
    });
  }

  return NextResponse.json(
    { error: 'Provide a projectId or species query parameter' },
    { status: 400 }
  );
}
