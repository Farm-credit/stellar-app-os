import { type NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db/client';

/**
 * GET /api/transactions
 *
 * Query params:
 *   type        — filter by tx_type (donation|escrow_deposit|…|other)
 *   account     — filter by source_account OR destination
 *   asset       — filter by asset_code (e.g. USDC, CARBON)
 *   from        — ISO-8601 start date (inclusive)
 *   to          — ISO-8601 end date (inclusive)
 *   limit       — max rows (default 50, max 200)
 *   offset      — pagination offset (default 0)
 */
export async function GET(request: NextRequest) {
  try {
    const p = request.nextUrl.searchParams;
    const type = p.get('type');
    const account = p.get('account');
    const asset = p.get('asset');
    const from = p.get('from');
    const to = p.get('to');
    const limit = Math.min(parseInt(p.get('limit') ?? '50', 10), 200);
    const offset = Math.max(parseInt(p.get('offset') ?? '0', 10), 0);

    const values = [type, account, asset?.toUpperCase() ?? null, from, to, limit, offset];
    const pool = getPool();

    const [dataResult, countResult] = await Promise.all([
      pool.query(
        `SELECT tx_hash, ledger, created_at, source_account, tx_type,
                asset_code, asset_issuer, amount, destination, memo, indexed_at
         FROM indexed_transactions
         WHERE ($1::text IS NULL OR tx_type = $1)
           AND ($2::text IS NULL OR source_account = $2 OR destination = $2)
           AND ($3::text IS NULL OR asset_code = $3)
           AND ($4::timestamptz IS NULL OR created_at >= $4)
           AND ($5::timestamptz IS NULL OR created_at <= $5)
         ORDER BY created_at DESC
         LIMIT $6 OFFSET $7`,
        values
      ),
      pool.query(
        `SELECT COUNT(*) AS total
         FROM indexed_transactions
         WHERE ($1::text IS NULL OR tx_type = $1)
           AND ($2::text IS NULL OR source_account = $2 OR destination = $2)
           AND ($3::text IS NULL OR asset_code = $3)
           AND ($4::timestamptz IS NULL OR created_at >= $4)
           AND ($5::timestamptz IS NULL OR created_at <= $5)`,
        values.slice(0, 5)
      ),
    ]);

    return NextResponse.json({
      transactions: dataResult.rows,
      total: parseInt(countResult.rows[0].total, 10),
      limit,
      offset,
    });
  } catch (err) {
    console.error('[api/transactions] error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
