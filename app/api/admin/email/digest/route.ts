import { NextResponse } from 'next/server';
import { sendWeeklySponsorDigest, type WeeklySponsorDigestParams } from '@/lib/email/sendgrid';
import { auditLog } from '@/lib/audit';
import { processFarmerPayment, type FarmerPaymentRequest } from '@/lib/payments/farmer';

const SUPPORTED_CURRENCIES = ['XLM', 'USDC', 'FIAT'] as const;
const SUPPORTED_METHODS = ['bank_transfer', 'crypto_wallet', 'payment_app'] as const;

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = await request.json() as { digests?: WeeklySponsorDigestParams[]; payments?: FarmerPaymentRequest[] };
    if (Array.isArray(body.payments)) {
      const results = [];
      for (const payment of body.payments) {
        if (!payment.farmerId || !payment.amount || !payment.currency || !payment.method) {
          await auditLog({ action: 'ADMIN_FARMER_PAYMENT_INVALID', details: { error: 'missing required fields', payment: { farmerId: payment.farmerId } } });
          return NextResponse.json({ error: 'each payment requires farmerId, amount, currency, and method' }, { status: 400 });
        }
        if (!SUPPORTED_CURRENCIES.includes(payment.currency as typeof SUPPORTED_CURRENCIES[number])) {
          await auditLog({ action: 'ADMIN_FARMER_PAYMENT_INVALID', details: { error: 'unsupported currency', currency: payment.currency } });
          return NextResponse.json({ error: `currency must be one of: ${SUPPORTED_CURRENCIES.join(', ')}` }, { status: 400 });
        }
        if (!SUPPORTED_METHODS.includes(payment.method as typeof SUPPORTED_METHODS[number])) {
          await auditLog({ action: 'ADMIN_FARMER_PAYMENT_INVALID', details: { error: 'unsupported method', method: payment.method } });
          return NextResponse.json({ error: `method must be one of: ${SUPPORTED_METHODS.join(', ')}` }, { status: 400 });
        }
        const result = await processFarmerPayment(payment);
        results.push(result);
      }
      await auditLog({ action: 'ADMIN_FARMER_PAYMENT_SUCCESS', details: { count: results.length } });
      return NextResponse.json({ processed: results.length, results });
    }
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