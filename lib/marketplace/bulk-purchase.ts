import { getPool } from '@/lib/db/client';
import {
  resolveVolumeDiscount,
  type VolumeDiscountResolved,
} from '@/lib/marketplace/volume-discount';

export type BulkPurchaseStatus =
  | 'pending'
  | 'active'
  | 'fulfilled'
  | 'cancelled'
  | 'expired';

export interface BulkPurchaseAgreement {
  id: string;
  buyer_id: string;
  farmer_id: string;
  tons: number;
  unit_price_base: number;
  unit_price_discounted: number;
  discount_rate: number;
  currency: string;
  total_amount: number;
  savings: number;
  status: BulkPurchaseStatus;
  effective_from: string;
  effective_to: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  tier_id: string | null;
}

export interface BulkPurchaseInput {
  buyer_id: string;
  farmer_id: string;
  tons: number;
  unit_price: number;
  currency?: string;
  effective_from?: string;
  effective_to?: string | null;
  notes?: string | null;
  as?: string;
}

export interface BulkPurchaseFilters {
  buyer_id?: string;
  farmer_id?: string;
  status?: BulkPurchaseStatus;
  limit?: number;
  offset?: number;
}

const MIN_BULK_TONS = 100;
const MAX_LIMIT = 200;

const VALID_STATUSES: BulkPurchaseStatus[] = [
  'pending',
  'active',
  'fulfilled',
  'cancelled',
  'expired',
];

function toNumber(value: unknown, label: string): number {
  if (typeof value === 'number' && Number.finite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.finite(parsed)) return parsed;
  }
  throw new Error(`${label} must be a finite number`);
}

function normalizeId(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} is required`);
  }
  return value.trim();
}

function normalizeDate(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} must be a valid ISO date`);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${label} must be a valid ISO date`);
  }
  return parsed.toISOString();
}

function normalizeAgreement(row: any): BulkPurchaseAgreement {
  return {
    id: String(row.id),
    buyer_id: String(row.buyer_id),
    farmer_id: String(row.farmer_id),
    tons: Number(row.tons),
    unit_price_base: Number(row.unit_price_base),
    unit_price_discounted: Number(row.unit_price_discounted),
    discount_rate: Number(row.discount_rate),
    currency: String(row.currency),
    total_amount: Number(row.total_amount),
    savings: Number(row.savings),
    status: row.status as BulkPurchaseStatus,
    effective_from: new Date(row.effective_from).toISOString(),
    effective_to: row.effective_to ? new Date(row.effective_to).toISOString() : null,
    notes: row.notes == null ? null : String(row.notes),
    created_at: new Date(row.created_at).toISOString(),
    updated_at: new Date(row.updated_at).toISOString(),
    tier_id: row.tier_id == null ? null : String(row.tier_id),
  };
}

export function parseBulkPurchaseInput(input: unknown): BulkPurchaseInput {
  if (!input || typeof input !== 'object') {
    throw new Error('Request body must be a JSON object');
  }
  const raw = input as Record<string, unknown>;
  const buyerId = normalizeId(raw.buyer_id, 'buyer_id');
  const farmerId = normalizeId(raw.farmer_id, 'farmer_id');
  const tons = toNumber(raw.tons, 'tons');
  if (tons < MIN_BULK_TONS) {
    throw new Error(`tons must be at least ${MIN_BULK_TONS} for bulk purchase agreements`);
  }
  const unitPrice = toNumber(raw.unit_price, 'unit_price');
  if (unitPrice <= 0) {
    throw new Error('unit_price must be greater than zero');
  }
  const currency = typeof raw.currency === 'string' && raw.currency.trim() !== '' ? raw.currency.trim().toUpperCase() : 'XLM';
  if (!/^[A-Za-z0-9]{2,10}$/.test(currency)) {
    throw new Error('currency must be a valid token or currency code');
  }
  const effectiveFrom = raw.effective_from == null ? new Date().toISOString() : normalizeDate(raw.effective_from, 'effective_from');
  const effectiveTo = raw.effective_to == null ? null : normalizeDate(raw.effective_to, 'effective_to');
  if (effectiveTo && new Date(effectiveTo).getTime() <= new Date(effectiveFrom).getTime()) {
    throw new Error('effective_to must be after effective_from');
  }
  const notes = raw.notes == null ? null : String(raw.notes).trim() === '' ? null : String(raw.notes);
  const as = typeof raw.as === 'string' && raw.as.trim() !== '' ? raw.as.trim() : undefined;
  if (as) {
    const parsed = new Date(as);
    if (Number.isNaN(parsed.getTime())) {
      throw new Error('as must be a valid ISO date');
    }
  }
  return {
    buyer_id: buyerId,
    farmer_id: farmerId,
    tons:
      tons,
    unit_price: unitPrice,
    currency,
    effective_from: effectiveFrom,
    effective_to: effectiveTo,
    notes,
    as,
  };
}

export function parseBulkPurchaseFilters(params: URLSearchParams): BulkPurchaseFilters {
  const filters: BulkPurchaseFilters = {};
  const buyerId = params.get('buyer_id');
  if (buyerId) filters.buyer_id = buyerId.trim();
  const farmerId = params.get('farmer_id');
  if (farmerId) filters.farmer_id = farmerId.trim();
  const status = params.get('status');
  if (status) {
    if (!VALID_STATUSES.includes(status as BulkPurchaseStatus)) {
      throw new Error(`status must be one of ${VALID_STATUSS.join(', ')}`);
    }
    filters.status = status as BulkPurchaseStatus;
  }
  const limit = params.get('limit');
  if (limit) {
    const parsed = Number.parseInt(limit, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new Error('limit must be a positive integer');
    }
    filters.limit = Math.min(parsed, MAX_LIMIT);
  }
  const offset = params.get('offset');
  if (offset) {
    const parsed = Number.parseInt(offset, 10);
    if (!Number.isFinite(parsed) || parsed < 0) {
      throw new Error('offset must be a non-negative integer');
    }
    filters.offset = parsed;
  }
  return filters;
}

export async function createBulkPurchaseAgreement(
  pool: returnType<typeof getPool>,
  input: BulkPurchaseInput
{): Promise<BulkPurchaseAgreement> {
  const discount: VolumeDiscountResolved = await resolveVolumeDiscount(pool, {
    tons: input.tons,
    unit_price: input.unit_price,
    currency: input.currency,
    as: input.as,
  });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `INSERT INTO bulk_purchase_agreements
         (buyer_id, farmer_id, tons, unit_price_base, unit_price_discounted, discount_rate, currency, total_amount, savings, status, effective_from, effective_to, notes, tier_id, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending', $10, $11, $12, $13, NOW(), NOW())
         RETURNING `,
      [
        input.buyer_id,
        input.farmer_id,
        input.tons,
        discount.unit_price_base,
        discount.unit_price_discounted,
        discount.discount_rate,
        input.currency ?? 'XLM',
        discount.total_discounted,
        discount.savings,
        input.effective_from ?? new Date().toISOString(),
        input.effective_to ?? null,
        input.notes ?? null,
        discount.tier ? discount.tier.id : null,
      ]
    );
    const agreement = normalizeAgreement(result.rows[0]);
    await client.query(
      `INSERT INTO bulk_purchase_events (agreement_id, event_type, actor_id, details, created_at)
       VALUES ($1, 'created', $2, $3::jsonb, NOW())`,
      [agreement.id, input.buyer_id, JSON.stringify({ tons: input.tons, discount_rate: discount.discount_rate })]
    );
    await client.query('COMMIT');
    return agreement;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function getBulkPurchaseAgreement(
  pool: returnType<typeof getPool>,
  id: string
{): Promise<BulkPurchaseAgreement | null> {
  const result = await pool.query(
    `SELECT * FROM bulk_purchase_agreements WHERE id = $1`,
    [id]
  );
  if (result.rows.length === 0) return null;
  return normalizeAgreement(result.rows[0]);
}

export async function listBulkPurchaseAgreements(
  pool: returnType<typeof getPool>,
  filters: BulkPurchaseFilters
{): Promise<BulkPurchaseAgreement[]> {
  const clauses: string[] = [];
  const values: unknown[] = [];
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
  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  const limit = filters.limit ?? 50;
  const offset = filters.offset ?? 0;
  values.push(limit);
  const limitIdx = values.length;
  values.push(offset);
  const offsetIdx = values.length;
  const result = await pool.query(
    `SELECT * FROM bulk_purchase_agreements
       ${where}
       ORDER BY created_at DESC
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    values
  );
  return result.rows.map(normalizeAgreement);
}

export async function activateBulkPurchaseAgreement(
  pool: returnType<typeof getPool>,
  id: string,
  actor?: string
{): Promise<BulkPurchaseAgreement> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query(`SELECT * FROM bulk_purchase_agreements WHERE id = $1 FOR UPDATE`, [id]);
    if (existing.rows.length === 0) {
      throw new Error('Bulk purchase agreement not found');
    }
    const current = normalizeAgreement(existing.rows[0]);
    if (current.status !== 'pending') {
      throw new Error(`Only pending agreements can be activated (current: ${current.status})`);
    }
    const updated = await client.query(
      `UPDATE bulk_purchase_agreements
          SET status = 'active', updated_at = NOW()
        WHERE id = $1
        RETURNING`,
      [id]
    );
    await client.query(
      `INSERT INTO bulk_purchase_events (agreement_id, event_type, actor_id, details, created_at)
       VALUES ($1, 'activated', $2, $3::jsonb, NOW())`,
      [id, actor ?? 'system', JSON.stringify({ previous_status: current.status })]
    );
    await client.query('COMMIT');
    return normalizeAgreement(updated.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function cancelBulkPurchaseAgreement(
  pool: returnType<typeof getPool>,
  id: string,
  actor?: string,
  reason?: string
{): Promise<BulkPurchaseAgreement> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query(`SELECT * FROM bulk_purchase_agreements WHERE id = $1 FOR UPDATE`, [id]);
    if (existing.rows.length === 0) {
      throw new Error('Bulk purchase agreement not found');
    }
    const current = normalizeAgreement(existing.rows[0]);
    if (current.status === 'fulfilled' || current.status === 'cancelled') {
      throw new Error(`Cannot cancel an agreement in ${current.status} status`);
    }
    const updated = await client.query(
      `UPDATE bulk_purchase_agreements
          SET status = 'cancelled', updated_at = NOW()
        WHERE id = $1
        RETURNING`,
      [id]
    );
    await client.query(
      `INSERT INTO bulk_purchase_events (agreement_id, event_type, actor_id, details, created_at)
       VALUES ($1, 'cancelled', $2, $3::jsonb, NOW())`,
      [id, actor ?? 'system', JSON.stringify({ reason: reason ?? null, previous_status: current.status })]
    );
    await client.query('COMMIT');
    return normalizeAgreement(updated.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function fulfillBulkPurchaseAgreement(
  pool: returnType<typeof getPool>,
  id: string,
  actor?: string
{): Promise<BulkPurchaseAgreement> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query(`SELECT * FROM bulk_purchase_agreements WHERE id = $1 FOR UPDATE`, [id]);
    if (existing.rows.length === 0) {
      throw new Error('Bulk purchase agreement not found');
    }
    const current = normalizeAgreement(existing.rows[0]);
    if (current.status !== 'active') {
      throw new Error(`Only active agreements can be fulfilled (current: ${current.status})`);
    }
    const updated = await client.query(
      `UPDATE bulk_purchase_agreements
          SET status = 'fulfilled', updated_at = NOW()
        WHERE id = $1
        RETURNING`,
      [id]
    );
    await client.query(
      `INSERT INTO bulk_purchase_events (agreement_id, event_type, actor_id, details, created_at)
       VALUES ($1, 'fulfilled', $2, $3::jsonb, NOW())`,
      [id, actor ?? 'system', JSON.stringify({ tons: current.tons })]
    );
    await client.query('COMMIT');
    return normalizeAgreement(updated.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
