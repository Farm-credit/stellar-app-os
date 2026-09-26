import { NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/auth/admin';
import { getPool } from '@/lib/db/client';
import {
  queueNewsletter,
  resolveSponsorRecipients,
  sendNewsletterBatch,
  SPONSOR_SEGMENTS,
  type NewsletterInput,
} from '@/lib/email/sponsor-campaigns';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const url = new URL(request.url);
  const segments = (url.searchParams.get('segments') ?? '').split(',').filter(Boolean);
  const region = url.searchParams.get('region') || undefined;
  if (segments.length === 0) return NextResponse.json({ segments: SPONSOR_SEGMENTS });
  try {
    const recipients = await resolveSponsorRecipients(getPool(), segments, region);
    return NextResponse.json({ recipients, count: recipients.length });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Invalid segment query' },
      { status: 400 }
    );
  }
}

export async function POST(request: Request) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  try {
    const body = (await request.json()) as Partial<NewsletterInput> & {
      send?: boolean;
      batchSize?: number;
    };
    if (!body.subject || !body.message || !Array.isArray(body.segments)) {
      return NextResponse.json(
        { error: 'subject, message, and segments are required' },
        { status: 400 }
      );
    }
    if (body.segments.includes('regional') && !body.region) {
      return NextResponse.json(
        { error: 'region is required for the regional segment' },
        { status: 400 }
      );
    }
    const campaign = await queueNewsletter(getPool(), {
      subject: body.subject,
      message: body.message,
      segments: body.segments as NewsletterInput['segments'],
      region: body.region,
    });
    const delivery = body.send
      ? await sendNewsletterBatch(getPool(), campaign.id, body.batchSize)
      : undefined;
    return NextResponse.json({ campaign, delivery }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to queue newsletter' },
      { status: 400 }
    );
  }
}
