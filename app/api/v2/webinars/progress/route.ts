/**
 * GET /api/v2/webinars/progress?attended=slug-a,slug-b — Issue #1419
 *
 * Curriculum progress for a farmer from the sessions they attended: tracks
 * completed, certificate eligibility and the next session to take.
 */

import { NextResponse } from 'next/server';
import { getCurriculumProgress } from '@/lib/webinars';
import { apiVersionHeaders } from '@/lib/api/versioning';

export const runtime = 'nodejs';

export function GET(request: Request): NextResponse {
  const attended = (new URL(request.url).searchParams.get('attended') ?? '')
    .split(',')
    .map((slug) => slug.trim())
    .filter(Boolean);

  return NextResponse.json(
    { progress: getCurriculumProgress(attended) },
    { headers: apiVersionHeaders('v2') as Record<string, string> }
  );
}
