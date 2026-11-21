/**
 * /api/gift-certificates — Issue #1107
 *
 * POST /api/gift-certificates
 *   Body: GiftCertificateInput & { sendEmail?: boolean }
 *   Creates a gift sponsorship certificate and returns its shareable link.
 *   When `sendEmail` is true and a recipient email is given, the certificate
 *   is emailed to the recipient with the PDF attached.
 *
 *   200 { certificate, shareUrl, pdfUrl, emailSent }
 *   400 { error, errors: Record<field, message> }
 *   429 { error }  — rate limited (per IP)
 */

import { NextResponse, type NextRequest } from 'next/server';
import {
  buildGiftShareUrl,
  createGiftCertificate,
  encodeGiftShareToken,
  renderGiftCertificateEmail,
  validateGiftCertificateInput,
} from '@/lib/gift/giftCertificate';
import { giftCertificateFileName, giftCertificatePdfBytes } from '@/lib/gift/giftCertificatePdf';
import { sendGiftCertificateEmail } from '@/lib/email/sendgrid';
import { MemoryRateLimiter } from '@/lib/rate-limit';

export const runtime = 'nodejs';

const limiter = new MemoryRateLimiter({ windowMs: 60_000, maxRequests: 10 });
// Emails reach third parties, so they get a much tighter budget.
const emailLimiter = new MemoryRateLimiter({ windowMs: 3_600_000, maxRequests: 5 });

function clientIp(request: NextRequest): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}

function baseUrl(request: NextRequest): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
}

function tooManyRequests(retryAfter?: number): NextResponse {
  return NextResponse.json(
    { error: 'Too many requests. Please try again later.' },
    { status: 429, headers: { 'Retry-After': String(retryAfter ?? 60) } }
  );
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const ip = clientIp(request);
  const limit = await limiter.limit(`gift:${ip}`);
  if (!limit.success) return tooManyRequests(limit.retryAfter);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body', errors: { body: 'Request body must be valid JSON' } },
      { status: 400 }
    );
  }

  const validated = validateGiftCertificateInput(body);
  if (!validated.ok) {
    return NextResponse.json(
      { error: 'Invalid gift certificate', errors: validated.errors },
      { status: 400 }
    );
  }

  const certificate = createGiftCertificate(validated.value);
  const shareUrl = buildGiftShareUrl(certificate, baseUrl(request));
  const pdfUrl = `${baseUrl(request)}/api/gift-certificates/${encodeGiftShareToken(certificate)}/pdf`;

  let emailSent = false;
  if (body.sendEmail === true && certificate.recipientEmail) {
    const emailLimit = await emailLimiter.limit(`gift-email:${ip}`);
    if (!emailLimit.success) return tooManyRequests(emailLimit.retryAfter);

    try {
      const email = renderGiftCertificateEmail(certificate, shareUrl);
      emailSent = await sendGiftCertificateEmail({
        to: certificate.recipientEmail,
        ...email,
        pdf: {
          fileName: giftCertificateFileName(certificate),
          content: giftCertificatePdfBytes(certificate, shareUrl),
        },
      });
    } catch (error) {
      // The certificate and share link are still valid; report the failure.
      console.error('[api/gift-certificates] email delivery failed:', error);
    }
  }

  return NextResponse.json(
    { certificate, shareUrl, pdfUrl, emailSent },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
