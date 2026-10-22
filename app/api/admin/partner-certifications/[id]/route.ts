/**
 * POST /api/admin/partner-certifications/:id  { decision: "approve" | "reject", note? }
 *
 * Approve or reject a certification application. Platform admin only. (#1691)
 */
import { type NextRequest, NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/auth/admin';
import { PartnerCertificationError, reviewApplication } from '@/lib/partner-certification';

export const runtime = 'nodejs';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  let body: { decision?: unknown; note?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (body.decision !== 'approve' && body.decision !== 'reject') {
    return NextResponse.json({ error: 'decision must be "approve" or "reject"' }, { status: 400 });
  }
  const note = typeof body.note === 'string' ? body.note : null;
  try {
    const { id } = await params;
    return NextResponse.json({ application: reviewApplication(id, body.decision, note) });
  } catch (error) {
    if (error instanceof PartnerCertificationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[api/admin/partner-certifications] error:', error);
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}
