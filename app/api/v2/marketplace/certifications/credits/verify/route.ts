import { NextResponse } from 'next/server';
import {
  authenticateCertificationRequest,
  certificationErrorResponse,
  certificationHeaders,
  parseJsonBody,
} from '@/lib/certification/api';
import { getCertificationService } from '@/lib/certification/runtime';
import { creditVerificationRequestSchema, validationErrors } from '@/lib/certification/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<NextResponse> {
  const auth = await authenticateCertificationRequest(request);
  if (!auth.ok) return auth.response;

  const body = await parseJsonBody(request);
  if (body instanceof NextResponse) return body;
  const parsed = creditVerificationRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid credit verification request', details: validationErrors(parsed.error) },
      { status: 400, headers: certificationHeaders(auth.client.tier) }
    );
  }

  try {
    const verification = await getCertificationService().verifyCredit(parsed.data);
    return NextResponse.json({ verification }, { headers: certificationHeaders(auth.client.tier) });
  } catch (error) {
    return certificationErrorResponse(error, auth.client.tier);
  }
}
