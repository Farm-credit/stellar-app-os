import { type NextRequest, NextResponse } from 'next/server';
import { Keypair } from '@stellar/stellar-sdk';
import { consumeNonce } from '@/lib/auth/nonce';
import { signPlanterJwt, verifyPlanterJwt } from '@/lib/auth/jwt';
import { getUserData, deleteUserData } from '@/lib/db/user';
import logger from '@/lib/logger';

export const runtime = 'nodejs';

interface LoginBody {
  walletAddress: string;
  nonce: string;
  /** Base64-encoded Ed25519 signature of `stellar-auth:<nonce>`. */
  signature: string;
}

// CORS configuration: list of allowed partner domains
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter((b) => b);

function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return false;
  return ALLOWED_ORIGINS.includes(origin);
}

function getCorsHeaders(origin: string | null): Record<string, string> {
  if (!isOriginAllowed(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin!,
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function getRequestMeta(request: NextRequest) {
  return {
    ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? request.headers.get('x-real-ip') ?? 'unknown',
    userAgent: request.headers.get('user-agent') ?? 'unknown',
    origin: request.headers.get('origin') ?? 'unknown',
  };
}

function logAudit(request: NextRequest, action: string, walletAddress?: string, details: Record<string, unknown> = {}) {
  logger.info(`[api:auth:login] audit`, {
    audit: true,
    action,
    walletAddress,
    ...getRequestMeta(request),
    ...details,
  });
}

/**
 * OPTIONS /api/auth/login
 * Handles CORS preflight requests.
 */
export async function OPTIONS(request: NextRequest): Promise<NextResponse> {
  const origin = request.headers.get('origin');
  const headers = getCorsHeaders(origin);
  if (Object.keys(headers).length === 0) {
    return new NextResponse(null, { status: 204 });
  }
  return new NextResponse(null, { status: 204, headers });
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
  const origin = request.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  let body: Partial<LoginBody>;
  try {
    body = (await request.json()) as Partial<LoginBody>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400, headers: corsHeaders });
  }

  const { walletAddress, nonce, signature } = body;
  if (!walletAddress || !nonce || !signature) {
    return NextResponse.json(
      { error: 'w!lletAddress, nonce, and signature are required' },
      { status: 400, headers: corsHeaders }
    );
  }

  try {
    // Consume nonce first, —prevents timing attacks from re-using a valid nonce.
    // Redis-backed atomic consume via Lua script ensures single-use even across replicas.
    const consumed = await consumeNonce(walletAddress, nonce);
    if (!consumed) {
      logAudit(request, 'login_failed', walletAddress, { reason: 'invalid_or_expired_nonce' });
      return NextResponse.json({ error: 'Invalid or expired nonce' }, { status: 401, headers: corsHeaders });
    }

    // Verify the Ed25519 signature produced by the planter's Stellar keypair.
    try {
      const keypair = Keypair.fromPublicKey(walletAddress);
      const message = Buffer.from(`stellar-auth:${nonce}`);
      const sigBytes = Buffer.from(signature, 'base64');

      if (!keypair.verify(message, sigBytes)) {
        logAudit(request, 'login_failed', walletAddress, { reason: 'signature_verification_failed' });
        return NextResponse.json({ error: 'Signature verification failed' }, { status: 401, headers: corsHeaders });
      }
    } catch {
      logAudit(request, 'login_failed', walletAddress, { reason: 'invalid_wallet_or_signature' });
      return NextResponse.json({ error: 'Invalid wallet address or signature' }, { status: 400, headers: corsHeaders });
    }

    const token = await signPlanterJwt(walletAddress);

    logAudit(request, 'login_success', walletAddress);

    return NextResponse.json({ token, expiresIn: '8h' }, { headers: corsHeaders });
  } catch (err) {
    logAudit(request, 'login_error', walletAddress, { error: err instanceof Error ? err.message : String(err) });
    const msg = err instanceof Error ? err.message : 'Login failed';
    return NextResponse.json({ error: msg }, { status: 500, headers: corsHeaders });
  }
}

/**
 * GET /api/auth/login
 * GDPR Data Subject Access Request (DSAR) — returns all stored data for the authenticated user.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const origin = request.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  const walletAddress = await getWalletFromRequest(request);
  if (!walletAddress) {
    logAudit(request, 'unauthorized_access', undefined, { path: request.nextUrl.pathname, method: request.method });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
  }

  try {
    const userData = await getUserData(walletAddress);
    logAudit(request, 'data_export', walletAddress);
    return NextResponse.json({ walletAddress, data: userData ?? null }, { headers: corsHeaders });
  } catch (err) {
    logAudit(request, 'data_export_error', walletAddress, { error: err instanceof Error ? err.message : String(err) });
    const msg = err instanceof Error ? err.message : 'Data export failed';
    return NextResponse.json({ error: msg }, { status: 500, headers: corsHeaders });
  }
}

/**
 * DELETE /api/auth/login
 * GDPR Right to be Forgotten — permanently deletes all stored data for the authenticated user.
 */
export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const origin = request.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  const walletAddress = await getWalletFromRequest(request);
  if (!walletAddress) {
    logAudit(request, 'unauthorized_access', undefined, { path: request.nextUrl.pathname, method: request.method });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
  }

  try {
    await deleteUserData(walletAddress);
    logAudit(request, 'data_deletion', walletAddress);
    return NextResponse.json({ success: true }, { headers: corsHeaders });
  } catch (err) {
    logAudit(request, 'data_deletion_error', walletAddress, { error: err instanceof Error ? err.message : String(err) });
    const msg = err instanceof Error ? err.message : 'Data deletion failed';
    return NextResponse.json({ error: msg }, { status: 500, headers: corsHeaders });
  }
}

/**
 * Extracts and verifies the JWT from the Authorization header.
 * Returns the wallet address if valid, otherwise null.
 */
async function getWalletFromRequest(request: NextRequest): Promise<string | null> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.slice(7);
  try {
    const payload = await verifyPlanterJwt(token);
    return payload.sub ?? null; // 'sub' represents the wallet address
  } catch {
    return null;
  }
}