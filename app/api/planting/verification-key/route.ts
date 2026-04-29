import { NextResponse } from 'next/server';
import { getPlantingVerificationPublicKey } from '@/lib/crypto/plantingVerification';

export function GET() {
  const publicKey = getPlantingVerificationPublicKey();

  if (!publicKey) {
    return NextResponse.json(
      { error: 'Planting verification public key is not configured' },
      { status: 503 }
    );
  }

  return NextResponse.json({ publicKey });
}
