import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db/client';
import logger from '@/lib/logger';
import { sanctionAuditQuerySchema } from '@/lib/sanctions/schema';
import type { SanctionAuditLogRow, SanctionAuditResponse } from '@/lib/types/sanctions';

/**
 * GET /api/sanctions/audit
 *
 * Returns paginated sanction audit log entries. Supports filtering by
 * stellar_address and/or result.
 *
 * Query params:
 *   address?  — filter by exact Stellar address
 *   result?   — filter by result enum value
 *   limit     — page size (default 20, max 100)
 *   offset    — page offset (default 0)
 *
 * Security:
 * - Admin-only endpoint. Apply auth middleware at the route group level.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const rawQuery = Object.fromEntries(searchParams.entries());

  const parsed = sanctionAuditQuerySchema.safeParse(rawQuery);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'Invalid query parameters',
        issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message })),
      },
      { status: 422 }
    );
  }

  const { address, result, limit, offset } = parsed.data;

  try {
    const pool = getPool();

    // Build dynamic WHERE clause
    const conditions: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (address) {
      conditions.push(`stellar_address = $${idx++}`);
      values.push(address);
    }
    if (result) {
      conditions.push(`result = $${idx++}`);
      values.push(result);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countQuery = `SELECT COUNT(*)::integer AS total FROM sanction_audit_log ${where}`;
    const dataQuery = `
      SELECT * FROM sanction_audit_log
      ${where}
      ORDER BY created_at DESC
      LIMIT $${idx} OFFSET $${idx + 1}
    `;

    const [countResult, dataResult] = await Promise.all([
      pool.query<{ total: number }>(countQuery, values),
      pool.query<SanctionAuditLogRow>(dataQuery, [...values, limit, offset]),
    ]);

    const response: SanctionAuditResponse = {
      data: dataResult.rows,
      total: countResult.rows[0]?.total ?? 0,
      limit,
      offset,
    };

    return NextResponse.json(response);
  } catch (err) {
    logger.error('[api/sanctions/audit] unhandled error', { err: String(err) });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
