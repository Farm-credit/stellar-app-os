import { getPool } from '@/lib/db/client';
import { computeBulkPriceQuote, getBasePricePerTon, MIN_BULK_TONS, type BulkPriceQuote } from '@/lib/marketplace/bulk-pricing';

export type BulkAgreementStatus = 'draft' | 'pending' | 'active' | 'completed' | 'cancelled';

export interface BulkAgreement {
  id: string;
  buyer_id: string;
  farmer_id: string;
  tons: number;
  base_price_per_ton: number;
  discount_rate: number;
  price_per_ton: number;
  total_price: number;
  currency: string;
  status: BulkAgreementStatus;
  delivery_starts: string | null;
  delivery_ends: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateBulkAgreementInput {
  buyer_id: string;
  farmer_id: string;
  tons: number;
  currency?: string;
  delivery_starts?: string | null;
  delivery_ends?: string | null;
  notes?: string | null;
  base_price_per_ton?: number;
}

function mapRow(row: any): BulkAgreement {
  return {
    id: row.id,
    buyer_id: row.buyer_id,
    farmer_id: row.farmer_id,
    tons: Number(row.tons),
    base_price_per_ton: Number(row.base_price_per_ton),
    discount_rate: Number(row.discount_rate),
    price_per_ton: Number(row.price_per_ton),
    total_price: Number(row.total_price),
    currency: row.currency,
    status: row.status,
    delivery_starts: row.delivery_starts ? new Date(row.delivery_starts).toISOString() : null,
    delivery_ends: row.delivery_ends ? new Date(row.delivery_ends).toISOString() : null,
    notes: row.notes ?? null,
    created_at: new Date(row.created_at).toISOString(),
    updated_at: new Date(row.updated_at).toISOString(),
  };
}

export async function createBulkAgreement(
  input: CreateBulkAgreementInput,
  pool = getPool()
): Promise<{ agreement: BulkAgreement; quote: BulkPriceQuote }> {
  if (!Number.finite(input.tons) || input.tons < MIN_BULK_TONS) {
    throw new Error(`bulk agreements require at least ${MIN_BULK_TONS} tons`);
  }
  if (!input.buyer_id || !input.farmer_id) {
    throw new Error('buyer_id and farmer_id are required');
  }

  const currency = input.currency ?? 'XLM';
  const basePricePerTon =
    input.base_price_per_ton ?? (await getBasePricePerTon(currency));
  const quote = computeBulkPriceQuote(input.tons, basePricePerTon, currency);

  const result = await pool.query(
    `INSERT INTO bulk_purchase_agreements
       (buyer_id, farmer_id, tons, base_price_per_ton, discount_rate,
        price_per_ton, total_price, currency, status, delivery_starts,
        delivery_ends, notes, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', $9, $10, $11, NOW(), NOW())
       RETURNING *`,
    [
      input.buyer_id,
      input.farmer_id,
      input.tons,
      quote.base_price_per_ton,
      quote.discount_rate,
      quote.discounted_price_per_ton,
      quote.total_price,
      currency,
      input.delivery_starts ?? null,
      input.delivery_ends ?? null,
      input.notes ?? null,
    ]
  );

  return { agreement: mapRow(result.rows[0]), quote };
}

export async function listBulkAgreements(
  filters: { buyer_id?: string; farmer_id?: string; status?: BulkAgreementStatus },
  pool = getPool()
): Promise<BulkAgreement[]> {
  const clauses: string[] = [];
  const values: any[] = [];
  if (filters.buyer_id) {
    values.push(filters.buyer_id);
    clauses.push(`buyer_id = $${values.length}`);
  }
  if (filters.farmer_id) {
    values.push(filters.farmer_id);
    clauses.push(`farmer_id = $${values.length}`);
  }
  if (filters.status) {
    values.push(filters.status);
    clauses.push(`status = $${values.length}`);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const result = await pool.query(
    `SELECT * FROM bulk_purchase_agreements ${where} ORDER BY created_at DESC`,
    values
  );
  return result.rows.map(mapRow);
}

export async function getBulkAgreementById(
  id: string,
  pool = getPool()
): Promise<BulkAgreement | null> {
  const result = await pool.query(`SELECT * FROM bulk_purchase_agreements WHERE id = $1`, [id]);
  if (result.rows.length === 0) return null;
  return mapRow(result.rows[0]);
}

export async function updateBulkAgreementStatus(
  id: string,
  status: BulkAgreementStatus,
  pool = getPool()
): Promise<BulkAgreement | null> {
  const result = await pool.query(
    `UPDATE bulk_purchase_agreements
     SET status = $2, updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [id, status]
  );
  if (result.rows.length === 0) return null;
  return mapRow(result.rows[0]);
}
