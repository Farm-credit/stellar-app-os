import { type NextRequest, NextResponse } from 'next/server';
import { Keypair } from '@stellar/stellar-sdk';
import { consumeNonce } from '@/lib/auth/nonce';
import { signPlanterJwt } from '@/lib/auth/jwt';

export const runtime = 'nodejs';

interface LoginBody {
  walletAddress: string;
  nonce: string;
  /** Base64-encoded Ed25519 signature of `stellar-auth:<nonce>`. */
  signature: string;
}

/**
 * POST /api/auth/login
 *
 * Flow:
 *  1. Client fetches a nonce from GET /api/auth/nonce?wallet=...
 *  2. Client signs `stellar-auth:<nonce>` with their Stellar private key via Freighter.
 *  3. Client posts { walletAddress, nonce, signature } here.
 *  4. Server verifies the Ed25519 signature and issues a short-lived JWT.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: Partial<LoginBody>;
  try {
    body = (await request.json()) as Partial<LoginBody>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { walletAddress, nonce, signature } = body;
  if (!walletAddress || !nonce || !signature) {
    return NextResponse.json(
      { error: 'walletAddress, nonce, and signature are required' },
      { status: 400 }
    );
  }

  // Consume nonce first — prevents timing attacks from re-using a valid nonce.
  if (!consumeNonce(walletAddress, nonce)) {
    return NextResponse.json({ error: 'Invalid or expired nonce' }, { status: 401 });
  }

  // Verify the Ed25519 signature produced by the planter's Stellar keypair.
  try {
    const keypair = Keypair.fromPublicKey(walletAddress);
    const message = Buffer.from(`stellar-auth:${nonce}`);
    const sigBytes = Buffer.from(signature, 'base64');

    if (!keypair.verify(message, sigBytes)) {
      return NextResponse.json({ error: 'Signature verification failed' }, { status: 401 });
    }
  } catch {
    return NextResponse.json({ error: 'Invalid wallet address or signature' }, { status: 400 });
  }

  const token = await signPlanterJwt(walletAddress);

  return NextResponse.json({ token, expiresIn: '8h' });
}
