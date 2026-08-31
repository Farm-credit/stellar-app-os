import { NextResponse } from 'next/server';
import { sendSegmentedNewsletter, type NewsletterRecipient } from '@/lib/email/sendgrid';

export const runtime = 'nodejs';

const SEGMENTS = new Set(['first-time', 'vip', 'lapsed', 'regional']);

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      subject?: string;
      message?: string;
      recipients?: NewsletterRecipient[];
    };
    if (!body.subject?.trim() || !body.message?.trim() || !Array.isArray(body.recipients)) {
      return NextResponse.json({ error: 'subject, message, and recipients are required' }, { status: 400 });
    }
    const recipients = body.recipients.filter((recipient) =>
      recipient?.email && recipient?.name && SEGMENTS.has(recipient.segment),
    );
    const sent = await sendSegmentedNewsletter({ subject: body.subject.trim(), message: body.message, recipients });
    return NextResponse.json({ sent, recipientCount: recipients.length });
  } catch {
    return NextResponse.json({ error: 'Invalid newsletter request' }, { status: 400 });
  }
}
