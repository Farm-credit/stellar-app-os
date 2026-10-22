/**
 * GET /api/field-reports[?projectArea=...]
 *
 * Lists generated weekly field reports. Admin only. (#1692)
 */
import { NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/auth/admin';
import { listFieldReports } from '@/lib/field-reports';

export const runtime = 'nodejs';

export async function GET(request: Request): Promise<NextResponse> {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const projectArea = new URL(request.url).searchParams.get('projectArea') ?? undefined;
  return NextResponse.json({ reports: listFieldReports({ projectArea }) });
}
