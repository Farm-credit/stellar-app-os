/**
 * Partner planting certification (#1691).
 *
 * POST /api/partner-certifications          Submit a certification application.
 * GET  /api/partner-certifications?partnerId=...   Public certification status.
 */
import { type NextRequest, NextResponse } from 'next/server';
import {
  PartnerCertificationError,
  getActiveCertification,
  listApplications,
  parseApplicationInput,
  submitApplication,
} from '@/lib/partner-certification';

export const runtime = 'nodejs';

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  try {
    const application = submitApplication(parseApplicationInput(body));
    return NextResponse.json({ application }, { status: 201 });
  } catch (error) {
    if (error instanceof PartnerCertificationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[api/partner-certifications] error:', error);
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}

export function GET(request: NextRequest): NextResponse {
  const partnerId = request.nextUrl.searchParams.get('partnerId');
  if (!partnerId) {
    return NextResponse.json({ error: 'partnerId is required' }, { status: 400 });
  }
  const certification = getActiveCertification(partnerId);
  const pending = listApplications({ partnerId, status: 'submitted' }).length > 0;
  return NextResponse.json({
    certified: certification !== undefined,
    certifiedAt: certification?.certifiedAt ?? null,
    expiresAt: certification?.expiresAt ?? null,
    pending,
  });
}
