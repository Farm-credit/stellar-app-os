/**
 * POST /api/field-reports/generate[?weekStart=YYYY-MM-DD]
 *
 * Compiles last week's field observations into one report per project area
 * and emails it to the project manager and platform admin. Run weekly by
 * .github/workflows/field-reports-weekly.yml. (#1692)
 *
 * Requires `Authorization: Bearer <FIELD_REPORT_CRON_SECRET>`.
 */
import { timingSafeEqual } from 'node:crypto';
import { type NextRequest, NextResponse } from 'next/server';
import { generateWeeklyFieldReports, startOfWeek } from '@/lib/field-reports';

export const runtime = 'nodejs';

function tokenMatches(header: string | null, expected: string): boolean {
  const supplied = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.FIELD_REPORT_CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ error: 'Field reports are not configured' }, { status: 503 });
  }
  if (!tokenMatches(request.headers.get('authorization'), secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const weekParam = request.nextUrl.searchParams.get('weekStart');
  let weekStart: Date | undefined;
  if (weekParam) {
    const parsed = new Date(weekParam);
    if (Number.isNaN(parsed.getTime())) {
      return NextResponse.json({ error: 'weekStart must be an ISO date' }, { status: 400 });
    }
    weekStart = startOfWeek(parsed);
  }

  const reports = await generateWeeklyFieldReports({ weekStart });
  return NextResponse.json({
    generated: reports.length,
    reports: reports.map((r) => ({
      id: r.id,
      projectArea: r.projectArea,
      anomalies: r.anomalies.length,
      sharedWith: r.sharedWith,
    })),
  });
}
