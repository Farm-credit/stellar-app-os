import { type NextRequest, NextResponse } from 'next/server';
import { generateNonce } from '@/lib/auth/nonce';

export const runtime = 'nodejs';

/** GET /api/auth/nonce?wallet=G... — returns a single-use nonce for wallet-signature login. */
export function GET(request: NextRequest): NextResponse {
  const wallet = request.nextUrl.searchParams.get('wallet') ?? '';

  // Stellar public keys are always 56 characters starting with G.
  if (!/^G[A-Z2-7]{55}$/.test(wallet)) {
    return NextResponse.json(
      { error: 'Valid Stellar public key required (56-char, starts with G)' },
      { status: 400 }
    );
  }

  const nonce = generateNonce(wallet);

  return NextResponse.json({
    nonce,
    // The client must sign exactly this string with their Stellar private key.
    message: `stellar-auth:${nonce}`,
    expiresIn: 300, // seconds
  });
}
