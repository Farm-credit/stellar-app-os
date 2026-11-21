import { NextResponse } from 'next/server';
import {
  authenticateCertificationRequest,
  certificationErrorResponse,
  certificationHeaders,
  parseJsonBody,
} from '@/lib/certification/api';
import { getCertificationService } from '@/lib/certification/runtime';
import { projectReferenceSchema, validationErrors } from '@/lib/certification/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<NextResponse> {
  const auth = await authenticateCertificationRequest(request);
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const parsed = projectReferenceSchema.safeParse({
    provider: url.searchParams.get('provider'),
    projectId: url.searchParams.get('projectId'),
  });
  if (!parsed.success) return validationResponse(parsed.error, auth.client.tier);

  try {
    const renewal = await getCertificationService().getRenewal(
      parsed.data.provider,
      parsed.data.projectId
    );
    return NextResponse.json({ renewal }, { headers: certificationHeaders(auth.client.tier) });
  } catch (error) {
    return certificationErrorResponse(error, auth.client.tier);
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  const auth = await authenticateCertificationRequest(request);
  if (!auth.ok) return auth.response;

  const body = await parseJsonBody(request);
  if (body instanceof NextResponse) return body;
  const parsed = projectReferenceSchema.safeParse(body);
  if (!parsed.success) return validationResponse(parsed.error, auth.client.tier);

  try {
    const renewal = await getCertificationService().syncRenewal(
      parsed.data.provider,
      parsed.data.projectId
    );
    return NextResponse.json({ renewal }, { headers: certificationHeaders(auth.client.tier) });
  } catch (error) {
    return certificationErrorResponse(error, auth.client.tier);
  }
}

function validationResponse(error: Parameters<typeof validationErrors>[0], tier: string) {
  return NextResponse.json(
    { error: 'Invalid certification renewal request', details: validationErrors(error) },
    { status: 400, headers: certificationHeaders(tier) }
  );
}
