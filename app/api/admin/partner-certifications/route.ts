/**
 * GET /api/admin/partner-certifications[?status=submitted|approved|rejected]
 *
 * Review queue for platform admins. (#1691)
 */
import { type NextRequest, NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/auth/admin';
import { listApplications, type CertificationStatus } from '@/lib/partner-certification';

export const runtime = 'nodejs';

const STATUSES: CertificationStatus[] = ['submitted', 'approved', 'rejected'];

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const status = request.nextUrl.searchParams.get('status');
  if (status && !STATUSES.includes(status as CertificationStatus)) {
    return NextResponse.json({ error: 'Unsupported status' }, { status: 400 });
  }
  return NextResponse.json({
    applications: listApplications({ status: (status as CertificationStatus) ?? undefined }),
  });
}
