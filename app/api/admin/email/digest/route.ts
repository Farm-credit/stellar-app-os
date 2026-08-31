import { NextResponse } from 'next/server';
import { sendWeeklySponsorDigest, type WeeklySponsorDigestParams } from '@/lib/email/sendgrid';
import { auditLog } from '@/lib/audit';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = await request.json() as { digests?: WeeklySponsorDigestParams[] };
    if (!Array.isArray(body.digests)) {
      await auditLog({ action: 'ADMIN_SEND_SPONSOR_DIGEST_INVALID', details: { error: 'digests must be an array' } });
      return NextResponse.json({ error: 'digests must be an array' }, { status: 400 });
    }
    for (const digest of body.digests) {
      if (!digest.sponsorEmail || !digest.sponsorName || !digest.periodLabel) {
        await auditLog({ action: 'ADMIN_SEND_SPONSOR_DIGEST_INVALID', details: { error: 'missing required fields', digest: { sponsorEmail: digest.sponsorEmail } } });
        return NextResponse.json({ error: 'each digest requires sponsorEmail, sponsorName, and periodLabel' }, { status: 400 });
      }
      await sendWeeklySponsorDigest({
        ...digest,
        communityHighlights: digest.communityHighlights ?? [],
        photoUrls: digest.photoUrls ?? [],
      });
    }
    await auditLog({ action: 'ADMIN_SEND_SPONSOR_DIGEST_SUCCESS', details: { count: body.digests.length } });
    return NextResponse.json({ queued: body.digests.length, cadence: 'weekly' });
  } catch (error) {
    await auditLog({ action: 'ADMIN_SEND_SPONSOR_DIGEST_ERROR', details: { error: (error as Error).message } });
    return NextResponse.json({ error: 'Invalid digest request' }, { status: 400 });
  }
}
