import { type NextRequest, NextResponse } from 'next/server';
import { getSubmissionPhoto } from '@/lib/field/submissions';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** GET /api/field/tree-updates/:id/photo — serves a submitted field photo. */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const photo = getSubmissionPhoto(id);
  if (!photo) {
    return NextResponse.json({ success: false, error: 'Photo not found' }, { status: 404 });
  }
  return new NextResponse(photo.bytes as BodyInit, {
    headers: {
      'Content-Type': photo.contentType,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
