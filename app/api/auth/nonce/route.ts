import { type NextRequest, NextResponse } from 'next/server';
import { generateNonce } from '@/lib/auth/nonce';
import logger from '@/lib/logger';

export const runtime = 'nodejs';

/** GET /api/auth/nonce?wallet=G... — returns a single-use nonce for wallet-signature login. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const wallet = request.nextUrl.searchParams.get('wallet') ?? '';

  // Stellar public keys are always 56 characters starting with G.
  if (!/^G[A-Z2-7]{55}$/.test(wallet)) {
    return NextResponse.json(
      { error: 'Valid Stellar public key required (56-char, starts with G)' },
      { status: 400 }
    );
  }

  try {
    const nonce = await generateNonce(wallet);

    logger.info('[api:auth:nonce] Issued nonce', { wallet });

    return NextResponse.json({
      nonce,
      // The client must sign exactly this string with their Stellar private key.
      message: `stellar-auth:${nonce}`,
      expiresIn: 300, // seconds
    });
  } catch (err) {
    logger.error('[api:auth:nonce] Failed to generate nonce', { wallet, err });
    const msg = err instanceof Error ? err.message : 'Failed to generate nonce';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
