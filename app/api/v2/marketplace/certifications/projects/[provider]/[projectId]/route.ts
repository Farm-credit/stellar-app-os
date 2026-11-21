import { NextResponse } from 'next/server';
import {
  authenticateCertificationRequest,
  certificationErrorResponse,
  certificationHeaders,
} from '@/lib/certification/api';
import { getCertificationService } from '@/lib/certification/runtime';
import { projectReferenceSchema, validationErrors } from '@/lib/certification/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ provider: string; projectId: string }> };

export async function GET(request: Request, context: RouteContext): Promise<NextResponse> {
  const auth = await authenticateCertificationRequest(request);
  if (!auth.ok) return auth.response;

  const parsed = projectReferenceSchema.safeParse(await context.params);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid certification project reference', details: validationErrors(parsed.error) },
      { status: 400, headers: certificationHeaders(auth.client.tier) }
    );
  }

  try {
    const project = await getCertificationService().getProject(
      parsed.data.provider,
      parsed.data.projectId
    );
    return NextResponse.json({ project }, { headers: certificationHeaders(auth.client.tier) });
  } catch (error) {
    return certificationErrorResponse(error, auth.client.tier);
  }
}
