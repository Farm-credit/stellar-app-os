import { NextResponse } from 'next/server';
import {
  evaluatePaymentProtection,
  type VerificationStatus,
} from '@/lib/escrow/payment-protection';

const statuses: VerificationStatus[] = ['pending', 'verified', 'retired'];

export function POST(request: Request): Promise<NextResponse> {
  return request
    .json()
    .then((body: { verificationStatus?: string; verificationPeriodEndsAt?: string }) => {
      if (!statuses.includes(body.verificationStatus as VerificationStatus)) {
        return NextResponse.json(
          { error: 'verificationStatus must be pending, verified, or retired' },
          { status: 400 }
        );
      }
      if (!body.verificationPeriodEndsAt) {
        return NextResponse.json(
          { error: 'verificationPeriodEndsAt is required' },
          { status: 400 }
        );
      }

      try {
        return NextResponse.json(
          evaluatePaymentProtection({
            verificationStatus: body.verificationStatus as VerificationStatus,
            verificationPeriodEndsAt: body.verificationPeriodEndsAt,
          }),
          { headers: { 'Cache-Control': 'private, no-store' } }
        );
      } catch (error) {
        return NextResponse.json(
          { error: error instanceof Error ? error.message : 'Invalid payment protection request' },
          { status: 400 }
        );
      }
    });
}
