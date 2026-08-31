/**
 * Revoke a single API key owned by the authenticated planter.
 *
 *   DELETE /api/api-keys/[id]
 *
 * Authentication:
 *   Requires a valid planter JWT (Authorization: Bearer <token>). A key can
 *   only be revoked by the wallet that created it.
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { verifyPlanterJwt } from '@/lib/auth/jwt';
import { getPool } from '@/lib/db/client';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ id: string }> };

function jsonError(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

export async function DELETE(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const authHeader = request.headers.get('authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) return jsonError('Authorization header with Bearer token is required', 401);

  const payload = await verifyPlanterJwt(token);
  if (!payload?.sub) return jsonError('Invalid or expired token', 401);

  const { id: idStr } = await context.params;
  if (!/^\d+$/.test(idStr)) return jsonError('id must be a positive integer', 400);
  const id = parseInt(idStr, 10);

  try {
    // Only the owning wallet may revoke a key, so one user cannot revoke
    // another's credential.
    const result = await getPool().query(
      `UPDATE api_keys
       SET is_active = FALSE, revoked_at = NOW()
       WHERE id = $1 AND is_active = TRUE AND revoked_at IS NULL AND owner_wallet = $2`,
      [id, payload.sub]
    );

    if ((result.rowCount ?? 0) === 0) {
      return jsonError('API key not found or already revoked', 404);
    }

    return NextResponse.json({ ok: true, id: String(id), revoked: true });
  } catch (error) {
    console.error('[api-keys] revoke failed', { id, error });
    return jsonError('Internal server error', 500);
  }
}
