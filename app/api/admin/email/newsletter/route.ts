import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { sendSegmentedNewsletter, type NewsletterRecipient } from '@/lib/email/sendgrid';
import { auditLog } from '@/lib/audit';

export const runtime = 'nodejs';

const SEGMENTS = new Set(['first-time', 'vip', 'lapsed', 'regional']);

export async function POST(request: Request) {
  const session = await getServerSession();
  const adminEmail = session?.user?.email ?? 'unknown';
  try {
    const body = await request.json() as {
      subject?: string;
      message?: string;
      recipients?: NewsletterRecipient[];
    };
    if (!body.subject?.trim() || !body.message?.trim() || !Array.isArray(body.recipients)) {
      await auditLog('admin.newsletter.invalid_request', { adminEmail, error: 'Missing required fields' });
      return NextResponse.json({ error: 'subject, message, and recipients are required' }, { status: 400 });
    }
    const recipients = body.recipients.filter((recipient) =>
      recipient?.email && recipient?.name && SEGMENTS.has(recipient.segment),
    );
    const sent = await sendSegmentedNewsletter({ subject: body.subject.trim(), message: body.message, recipients });
    await auditLog('admin.newsletter.sent', { adminEmail, subject: body.subject.trim(), recipientCount: recipients.length, sentCount: sent });
    return NextResponse.json({ sent, recipientCount: recipients.length });
  } catch (error) {
    await auditLog('admin.newsletter.error', { adminEmail, error: error instanceof Error ? error.message : 'Unknown error' });
    return NextResponse.json({ error: 'Invalid newsletter request' }, { status: 400 });
  }
}
