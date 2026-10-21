import { createHash } from 'node:crypto';
import { Keypair } from '@stellar/stellar-sdk';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { generateNonce, consumeNonce } from '@/lib/auth/nonce';
import { signPlanterJwt } from '@/lib/auth/jwt';
import {
  VOLUNTEER_COOKIE,
  requireSameOrigin,
  volunteerWallet,
  volunteerResponse,
  volunteerOrigin,
} from '@/lib/volunteers/auth';
import { VolunteerError } from '@/lib/volunteers/service';

export const runtime = 'nodejs';
const walletSchema = z.string().regex(/^G[A-Z2-7]{55}$/);
const loginSchema = z.object({
  wallet: walletSchema,
  nonce: z.uuid(),
  signature: z.string().max(128),
});
function message(origin: string, wallet: string, nonce: string) {
  return `FarmCredit volunteer sign-in\nOrigin: ${origin}\nWallet: ${wallet}\nNonce: ${nonce}`;
}

export async function GET(request: NextRequest) {
  try {
    const wallet = request.nextUrl.searchParams.get('wallet');
    if (!wallet) return NextResponse.json({ wallet: await volunteerWallet(request) });
    if (!process.env.JWT_SECRET) throw new VolunteerError('Sign-in is not configured', 503);
    walletSchema.parse(wallet);
    const nonce = await generateNonce(wallet);
    return NextResponse.json(
      { nonce, message: message(volunteerOrigin(request), wallet, nonce) },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    return volunteerResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    requireSameOrigin(request);
    if (!process.env.JWT_SECRET) throw new VolunteerError('Sign-in is not configured', 503);
    const input = loginSchema.parse(await request.json());
    if (!(await consumeNonce(input.wallet, input.nonce)))
      throw new VolunteerError('Sign-in challenge expired. Please try again', 401);
    // SEP-53: Freighter signs SHA-256(prefix + UTF-8 message), not raw text.
    const digest = createHash('sha256')
      .update('Stellar Signed Message:\n')
      .update(message(volunteerOrigin(request), input.wallet, input.nonce))
      .digest();
    let valid = false;
    try {
      valid = Keypair.fromPublicKey(input.wallet).verify(
        digest,
        Buffer.from(input.signature, 'base64')
      );
    } catch {
      /* Invalid signature */
    }
    if (!valid) throw new VolunteerError('Unable to verify the wallet signature', 401);
    const response = NextResponse.json({ wallet: input.wallet });
    response.cookies.set(VOLUNTEER_COOKIE, await signPlanterJwt(input.wallet), {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 8 * 3600,
    });
    return response;
  } catch (error) {
    return volunteerResponse(error);
  }
}

export function DELETE(request: NextRequest) {
  try {
    requireSameOrigin(request);
    const response = NextResponse.json({ success: true });
    response.cookies.set(VOLUNTEER_COOKIE, '', {
      httpOnly: true,
      sameSite: 'strict',
      path: '/',
      maxAge: 0,
    });
    return response;
  } catch (error) {
    return volunteerResponse(error);
  }
}
