import { NextResponse } from 'next/server';
import { sendWeeklySponsorDigest, type WeeklySponsorDigestParams } from '@/lib/email/sendgrid';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = await request.json() as { digests?: WeeklySponsorDigestParams[] };
    if (!Array.isArray(body.digests)) {
      return NextResponse.json({ error: 'digests must be an array' }, { status: 400 });
    }
    for (const digest of body.digests) {
      if (!digest.sponsorEmail || !digest.sponsorName || !digest.periodLabel) {
        return NextResponse.json({ error: 'each digest requires sponsorEmail, sponsorName, and periodLabel' }, { status: 400 });
      }
      await sendWeeklySponsorDigest({
        ...digest,
        communityHighlights: digest.communityHighlights ?? [],
        photoUrls: digest.photoUrls ?? [],
      });
    }
    return NextResponse.json({ queued: body.digests.length, cadence: 'weekly' });
  } catch {
    return NextResponse.json({ error: 'Invalid digest request' }, { status: 400 });
  }
}
