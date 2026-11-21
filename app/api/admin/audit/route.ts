import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db/client';
import logger from '@/lib/logger';
import { writeAuditSchema, auditQuerySchema } from '@/lib/admin/auditSchema';
import { writeAuditLog, queryAuditLogs } from '@/lib/admin/auditLog';
import type { WriteAuditResponse, AuditListResponse } from '@/lib/types/auditLog';

/**
 * POST /api/admin/audit
 *
 * Records an immutable admin override action in the audit log.
 * The caller (typically a server-side admin action handler) supplies:
 *   - entity_type and entity_id: what was changed
 *   - action: the type of override
 *   - reason: mandatory justification text (≥10 chars)
 *   - before_state / after_state: optional JSON snapshots
 *
 * Admin identity is read from the x-admin-id request header.
 * In production, this header is set by your auth/session middleware.
 *
 * Response: { event_id, created_at }
 */
export async function POST(request: Request): Promise<NextResponse> {
  const adminId = request.headers.get('x-admin-id');
  if (!adminId) {
    return NextResponse.json({ error: 'x-admin-id header is required' }, { status: 401 });
  }

  const adminDisplay = request.headers.get('x-admin-display') ?? null;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = writeAuditSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'Validation failed',
        issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message })),
      },
      { status: 422 }
    );
  }

  try {
    const pool = getPool();
    const row = await writeAuditLog(pool, {
      admin_id: adminId,
      admin_display: adminDisplay,
      ...parsed.data,
    });

    const response: WriteAuditResponse = {
      event_id: row.event_id,
      created_at: row.created_at.toISOString(),
    };

    return NextResponse.json(response, { status: 201 });
  } catch (err) {
    logger.error('[api/admin/audit] write failed', { err: String(err) });
    return NextResponse.json({ error: 'Failed to record audit log' }, { status: 500 });
  }
}

/**
 * GET /api/admin/audit
 *
 * Returns paginated audit log entries with optional filtering.
 *
 * Query params:
 *   admin_id?    — filter by admin who performed the action
 *   entity_type? — filter by entity type
 *   entity_id?   — filter by specific entity ID
 *   action?      — filter by action type
 *   limit        — page size (default 20, max 100)
 *   offset       — page offset (default 0)
 */
export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const rawQuery = Object.fromEntries(searchParams.entries());

  const parsed = auditQuerySchema.safeParse(rawQuery);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'Invalid query parameters',
        issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message })),
      },
      { status: 422 }
    );
  }

  try {
    const pool = getPool();
    const { rows, total } = await queryAuditLogs(pool, parsed.data);

    const response: AuditListResponse = {
      data: rows,
      total,
      limit: parsed.data.limit,
      offset: parsed.data.offset,
    };

    return NextResponse.json(response);
  } catch (err) {
    logger.error('[api/admin/audit] query failed', { err: String(err) });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
