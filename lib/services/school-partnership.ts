import type { Pool } from 'pg';
import {
  SCHOOL_TIER_DISCOUNTS,
  type BatchStatus,
  type ContributeToBatchInput,
  type CreateBatchInput,
  type CreateSchoolPartnershipInput,
  type EnrollStudentsInput,
  type SchoolBatchSummary,
  type SchoolMemberSummary,
  type SchoolPartnershipDetail,
  type SchoolPartnershipSummary,
  type SchoolTier,
} from '@/lib/types/school-partnership';

// ── Helpers ─────────────────────────────────────────────────────────────────

function toNum(v: string | number | null | undefined): number {
  if (v == null) return 0;
  const n = typeof v === 'string' ? Number.parseFloat(v) : v;
  return Number.isFinite(n) ? n : 0;
}

// ── Partnerships ────────────────────────────────────────────────────────────

/** Create a new school partnership. */
export async function createSchoolPartnership(
  pool: Pick<Pool, 'query'>,
  input: CreateSchoolPartnershipInput
): Promise<{ id: number }> {
  const tier: SchoolTier = input.tier ?? 'standard';
  const discount = SCHOOL_TIER_DISCOUNTS[tier] ?? 0;

  const result = await pool.query<{ id: number }>(
    `INSERT INTO school_partnerships
       (school_name, contact_name, contact_email, contact_wallet, country_code, city, student_count, tier, discount_pct)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id`,
    [
      input.school_name.trim(),
      input.contact_name.trim(),
      input.contact_email.trim(),
      input.contact_wallet ?? null,
      input.country_code ?? 'NG',
      input.city ?? null,
      input.student_count ?? 0,
      tier,
      discount.toString(),
    ]
  );

  return { id: result.rows[0].id };
}

/** List active school partnerships. */
export async function listSchoolPartnerships(
  pool: Pick<Pool, 'query'>,
  opts: { country?: string; limit?: number; offset?: number } = {}
): Promise<SchoolPartnershipSummary[]> {
  const conditions = ['sp.deleted_at IS NULL'];
  const params: unknown[] = [];
  let idx = 1;

  if (opts.country) {
    conditions.push(`sp.country_code = $${idx++}`);
    params.push(opts.country);
  }

  const limit = opts.limit ?? 50;
  const offset = opts.offset ?? 0;

  const result = await pool.query<{
    id: number;
    school_name: string;
    tier: SchoolTier;
    discount_pct: string;
    student_count: number;
    country_code: string;
    created_at: Date;
    active_batches: string;
    total_trees_funded: string;
  }>(
    `SELECT
       sp.id, sp.school_name, sp.tier, sp.discount_pct, sp.student_count,
       sp.country_code, sp.created_at,
       (SELECT COUNT(*) FROM school_sponsorship_batches b WHERE b.partnership_id = sp.id AND b.status IN ('open', 'funded')) AS active_batches,
       (SELECT COALESCE(SUM(b.trees_funded), 0) FROM school_sponsorship_batches b WHERE b.partnership_id = sp.id) AS total_trees_funded
     FROM school_partnerships sp
     WHERE ${conditions.join(' AND ')}
     ORDER BY sp.created_at DESC
     LIMIT $${idx++} OFFSET $${idx++}`,
    [...params, limit, offset]
  );

  return result.rows.map((r) => ({
    id: r.id,
    school_name: r.school_name,
    tier: r.tier,
    discount_pct: toNum(r.discount_pct),
    student_count: r.student_count,
    active_batches: Number(r.active_batches),
    total_trees_funded: Number(r.total_trees_funded),
    country_code: r.country_code,
    created_at: r.created_at.toISOString(),
  }));
}

/** Get full details for a school partnership. */
export async function getSchoolPartnershipDetail(
  pool: Pick<Pool, 'query'>,
  partnershipId: number
): Promise<SchoolPartnershipDetail | null> {
  const spResult = await pool.query<{
    id: number;
    school_name: string;
    contact_name: string;
    contact_email: string;
    country_code: string;
    city: string | null;
    student_count: number;
    tier: SchoolTier;
    discount_pct: string;
    active: boolean;
    created_at: Date;
  }>(
    `SELECT id, school_name, contact_name, contact_email, country_code, city,
            student_count, tier, discount_pct, active, created_at
     FROM school_partnerships
     WHERE id = $1 AND deleted_at IS NULL`,
    [partnershipId]
  );

  const sp = spResult.rows[0];
  if (!sp) return null;

  const [membersResult, batchesResult] = await Promise.all([
    pool.query<{
      id: number;
      wallet: string;
      student_name: string | null;
      grade: string | null;
      enrolled_at: Date;
    }>(
      `SELECT id, wallet, student_name, grade, enrolled_at
       FROM school_partnership_members
       WHERE partnership_id = $1
       ORDER BY enrolled_at ASC`,
      [partnershipId]
    ),
    pool.query<{
      id: number;
      project_name: string;
      description: string | null;
      target_trees: number;
      trees_funded: number;
      total_xlm: string;
      discount_pct: string;
      status: BatchStatus;
      created_at: Date;
      completed_at: Date | null;
    }>(
      `SELECT id, project_name, description, target_trees, trees_funded,
              total_xlm, discount_pct, status, created_at, completed_at
       FROM school_sponsorship_batches
       WHERE partnership_id = $1
       ORDER BY created_at DESC`,
      [partnershipId]
    ),
  ]);

  const members: SchoolMemberSummary[] = membersResult.rows.map((m) => ({
    id: m.id,
    wallet: m.wallet,
    student_name: m.student_name,
    grade: m.grade,
    enrolled_at: m.enrolled_at.toISOString(),
  }));

  const totalTreesFunded = batchesResult.rows.reduce((sum, b) => sum + b.trees_funded, 0);

  const batches: SchoolBatchSummary[] = batchesResult.rows.map((b) => ({
    id: b.id,
    project_name: b.project_name,
    description: b.description,
    target_trees: b.target_trees,
    trees_funded: b.trees_funded,
    progress_pct: b.target_trees > 0 ? Math.round((b.trees_funded / b.target_trees) * 100) : 0,
    total_xlm: toNum(b.total_xlm),
    discount_pct: toNum(b.discount_pct),
    status: b.status,
    created_at: b.created_at.toISOString(),
    completed_at: b.completed_at?.toISOString() ?? null,
  }));

  return {
    id: sp.id,
    school_name: sp.school_name,
    tier: sp.tier,
    discount_pct: toNum(sp.discount_pct),
    student_count: sp.student_count,
    active_batches: batches.filter((b) => b.status === 'open' || b.status === 'funded').length,
    total_trees_funded: totalTreesFunded,
    country_code: sp.country_code,
    created_at: sp.created_at.toISOString(),
    contact_name: sp.contact_name,
    contact_email: sp.contact_email,
    city: sp.city,
    members,
    batches,
  };
}

// ── Members ─────────────────────────────────────────────────────────────────

/** Bulk-enroll students into a school partnership. */
export async function enrollStudents(
  pool: Pick<Pool, 'query'>,
  input: EnrollStudentsInput
): Promise<{ enrolled: number; skipped: number }> {
  let enrolled = 0;
  let skipped = 0;

  for (const student of input.students) {
    const wallet = student.wallet.trim();
    if (!wallet) {
      skipped++;
      continue;
    }

    const result = await pool.query<{ id: number }>(
      `INSERT INTO school_partnership_members (partnership_id, wallet, student_name, grade)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (partnership_id, wallet) DO NOTHING
       RETURNING id`,
      [input.partnership_id, wallet, student.student_name ?? null, student.grade ?? null]
    );

    if (result.rows[0]) {
      enrolled++;
    } else {
      skipped++;
    }
  }

  // Update student_count on the partnership.
  await pool.query(
    `UPDATE school_partnerships
     SET student_count = (SELECT COUNT(*) FROM school_partnership_members WHERE partnership_id = $1),
         updated_at = NOW()
     WHERE id = $1`,
    [input.partnership_id]
  );

  return { enrolled, skipped };
}

// ── Batches ─────────────────────────────────────────────────────────────────

/** Create a class project sponsorship batch. */
export async function createBatch(
  pool: Pick<Pool, 'query'>,
  input: CreateBatchInput
): Promise<{ id: number }> {
  // Fetch the partnership's discount.
  const spResult = await pool.query<{ discount_pct: string }>(
    'SELECT discount_pct FROM school_partnerships WHERE id = $1 AND deleted_at IS NULL',
    [input.partnership_id]
  );
  const discountPct = spResult.rows[0]?.discount_pct ?? '0';

  const result = await pool.query<{ id: number }>(
    `INSERT INTO school_sponsorship_batches
       (partnership_id, project_name, description, target_trees, discount_pct, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [
      input.partnership_id,
      input.project_name.trim(),
      input.description ?? null,
      input.target_trees ?? 10,
      discountPct,
      input.created_by,
    ]
  );

  return { id: result.rows[0].id };
}

/** Contribute trees to a batch. */
export async function contributeToBatch(
  pool: Pick<Pool, 'query'>,
  input: ContributeToBatchInput
): Promise<{ contribution_id: number; batch_status: BatchStatus }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Verify batch is open.
    const batchResult = await client.query<{
      status: BatchStatus;
      target_trees: number;
      trees_funded: number;
    }>(
      'SELECT status, target_trees, trees_funded FROM school_sponsorship_batches WHERE id = $1 FOR UPDATE',
      [input.batch_id]
    );

    const batch = batchResult.rows[0];
    if (!batch) throw new Error('Batch not found');
    if (batch.status !== 'open' && batch.status !== 'funded') {
      throw new Error(`Batch is not accepting contributions (status: ${batch.status})`);
    }

    // Check membership (if member_id provided).
    if (input.member_id) {
      const memberResult = await client.query<{ id: number }>(
        'SELECT id FROM school_partnership_members WHERE id = $1 AND partnership_id = (SELECT partnership_id FROM school_sponsorship_batches WHERE id = $2)',
        [input.member_id, input.batch_id]
      );
      if (!memberResult.rows[0])
        throw new Error("Member does not belong to this batch's partnership");
    }

    // Insert contribution.
    const contribResult = await client.query<{ id: number }>(
      `INSERT INTO school_batch_contributions
         (batch_id, member_id, wallet, trees_funded, xlm_amount, tx_hash)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [
        input.batch_id,
        input.member_id ?? null,
        input.wallet,
        input.trees_funded,
        input.xlm_amount.toString(),
        input.tx_hash ?? null,
      ]
    );

    // Update batch totals.
    const newFunded = batch.trees_funded + input.trees_funded;
    const newStatus: BatchStatus = newFunded >= batch.target_trees ? 'funded' : 'open';

    await client.query(
      `UPDATE school_sponsorship_batches
       SET trees_funded = $1,
           total_xlm = total_xlm + $2,
           status = $3,
           updated_at = NOW()
       WHERE id = $4`,
      [newFunded, input.xlm_amount.toString(), newStatus, input.batch_id]
    );

    await client.query('COMMIT');

    return { contribution_id: contribResult.rows[0].id, batch_status: newStatus };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/** Calculate discounted price for a school partnership batch. */
export function calculateBatchPrice(
  treePriceXlm: number,
  treesCount: number,
  discountPct: number
): { original: number; discounted: number; savings: number } {
  const original = treePriceXlm * treesCount;
  const savings = original * (discountPct / 100);
  return {
    original,
    discounted: original - savings,
    savings,
  };
}
