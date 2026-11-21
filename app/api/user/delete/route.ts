import { type NextRequest, NextResponse } from 'next/server';
import { verifyPlanterJwt } from '@/lib/auth/jwt';
import { deleteUserData } from '@/lib/gdpr';
import logger from '@/lib/logger';

export const runtime = 'nodejs';

/**
 * DELETE /api/user/delete
 * Permanently delete all personal data for the authenticated user (right to be forgotten).
 *
 * Requires Bearer token in Authorization header.
 */
export async function DELETE(request: NextRequest): Promise<NextResponse> {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Missing or invalid authorization header' },
        { status: 401 }
      );
    }

    const token = authHeader.slice('Bearer '.length);
    let walletAddress: string;
    try {
      walletAddress = await verifyPlanterJwt(token);
    } catch {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
    }

    await deleteUserData(walletAddress);

    return NextResponse.json({
      success: true,
      message: 'All user data has been permanently deleted.',
      deletedAt: new Date().toISOString(),
    });
  } catch (err) {
    logger.error('[api:user:delete] Error deleting user data', { err });
    const msg = err instanceof Error ? err.message : 'Deletion failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
