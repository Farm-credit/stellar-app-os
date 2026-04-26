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

    const conditions: string[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const values: any[] = [];
    let idx = 1;

    if (type) {
      conditions.push(`tx_type = $${idx++}`);
      values.push(type);
    }
    if (account) {
      conditions.push(`(source_account = $${idx} OR destination = $${idx})`);
      values.push(account);
      idx++;
    }
    if (asset) {
      conditions.push(`asset_code = $${idx++}`);
      values.push(asset.toUpperCase());
    }
    if (from) {
      conditions.push(`created_at >= $${idx++}`);
      values.push(from);
    }
    if (to) {
      conditions.push(`created_at <= $${idx++}`);
      values.push(to);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const pool = getPool();

    const [dataResult, countResult] = await Promise.all([
      pool.query(
        `SELECT tx_hash, ledger, created_at, source_account, tx_type,
                asset_code, asset_issuer, amount, destination, memo, indexed_at
         FROM indexed_transactions
         ${where}
         ORDER BY created_at DESC
         LIMIT $${idx} OFFSET $${idx + 1}`,
        [...values, limit, offset]
      ),
      pool.query(`SELECT COUNT(*) AS total FROM indexed_transactions ${where}`, values),
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
