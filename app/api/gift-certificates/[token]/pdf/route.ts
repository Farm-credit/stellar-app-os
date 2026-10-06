/**
 * GET /api/gift-certificates/:token/pdf — Issue #1107
 *
 * Renders the shareable gift certificate encoded in `token` as a PDF.
 *   200 application/pdf
 *   404 { error } — token is malformed or invalid
 */

import { NextResponse, type NextRequest } from 'next/server';
import { buildGiftShareUrl, decodeGiftShareToken } from '@/lib/gift/giftCertificate';
import { giftCertificateFileName, giftCertificatePdfBytes } from '@/lib/gift/giftCertificatePdf';

export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
): Promise<NextResponse> {
  const { token } = await params;
  const certificate = decodeGiftShareToken(token);
  if (!certificate) {
    return NextResponse.json({ error: 'Gift certificate not found' }, { status: 404 });
  }

  const origin = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
  const pdf = giftCertificatePdfBytes(certificate, buildGiftShareUrl(certificate, origin));
  const download = new URL(request.url).searchParams.get('download') === '1';

  return new NextResponse(pdf, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${giftCertificateFileName(certificate)}"`,
      'Cache-Control': 'public, max-age=86400, immutable',
    },
  });
}
