import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { sendSegmentedNewsletter, type NewsletterRecipient } from '@/lib/email/sendgrid';
import { processFarmerPayments, type PaymentRequest, type PaymentCurrency, type PaymentMethod, type PaymentResult } from '@/lib/payments/farmer-payments';
import { auditLog } from '@/lib/audit';

export const runtime = 'nodejs';

const SEGMENTS = new Set(['first-time', 'vip', 'lapsed', 'regional']);
const CURRENCIES = new Set<PaymentCurrency>(['XLM', 'USDC', 'FIAT']);
const METHODS = new Set<PaymentMethod>(['bank_transfer', 'crypto_wallet', 'payment_app']);

export async function POST(request: Request) {
  const session = await getServerSession();
  const adminEmail = session?.user?.email ?? 'unknown';
  try {
    const body = await request.json() as {
      subject?: string;
      message?: string;
      recipients?: NewsletterRecipient[];
      payments?: PaymentRequest[];
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

export async function PUT(request: Request) {
  const session = await getServerSession();
  const adminEmail = session?.user?.email ?? 'unknown';
  try {
    const body = await request.json() as { payments?: PaymentRequest[] };
    if (!Array.isArray(body.payments) || body.payments.length === 0) {
      await auditLog('admin.payments.invalid_request', { adminEmail, error: 'Missing payments' });
      return NextResponse.json({ error: 'payments are required' }, { status: 400 });
    }
    const invalid = body.payments.find((payment) =>
      !payment?.farmerId ||
      !CURRENCIES.has(payment.currency) ||
      !METHODS.has(payment.method) ||
      !payment.destination ||
      typeof payment.amount !== 'number' ||
      payment.amount <= 0,
    );
    if (invalid) {
      await auditLog('admin.payments.invalid_request', { adminEmail, error: 'Invalid payment entry', payment: invalid });
      return NextResponse.json(
        { error: 'each payment requires farmerId, a destination, a positive amount, and a supported currency (XLM, USDC, FIAT) and method (bank_transfer, crypto_wallet, payment_app)' },
        { status: 400 },
      );
    }
    const results = await processFarmerPayments(body.payments);
    await auditLog('admin.payments.processed', { adminEmail, paymentCount: body.payments.length, results });
    const failed = (results as PaymentResult[]).filter((result) => result.status === 'failed');
    const status = failed.length === 0 ? 200 : failed.length === results.length ? 502 : 207;
    return NextResponse.json({ results, failedCount: failed.length }, { status });
  } catch (error) {
    await auditLog('admin.payments.error', { adminEmail, error: error instanceof Error ? error.message : 'Unknown error' });
    return NextResponse.json({ error: 'Invalid payment request' }, { status: 400 });
  }
}