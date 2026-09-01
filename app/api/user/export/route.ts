import { type NextRequest, NextResponse } from 'next/server';
import { verifyPlanterJwt } from '@/lib/auth/jwt';
import { getUserDataForExport } from '@/lib/gdpr';
import logger from '@/lib/logger';

export const runtime = 'nodejs';

/**
 * GET /api/user/export
 * Export all personal data for the authenticated user (GDPR DSAR).
 *
 * Requires Bearer token in Authorization header (from /api/auth/login).
 *
 * Response format:
 * {
 *   "requestedAt": "2025-04-01T12:00:00.000Z",
 *   "walletAddress": "G...",
 *   "data": {
 *     "profile": {...},
 *     "trees": [...],
 *     "transactions": [...]
 *   }
 * }
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Missing or invalid authorization header' }, { status: 401 });
    }

    const token = authHeader.slice('Bearer '.length);
    let walletAddress: string;
    try {
      walletAddress = await verifyPlanterJwt(token);
    } catch {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
    }

    const userData = await getUserDataForExport(walletAddress);

    return NextResponse.json({
      requestedAt: new Date().toISOString(),
      walletAddress,
      data: userData,
    });
  } catch (err) {
    logger.error('[api:user:export] Error exporting user data', { err });
    const msg = err instanceof Error ? err.message : 'Export failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
