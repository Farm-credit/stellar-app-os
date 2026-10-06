/**
 * Corporate offset program service — Closes #1337.
 *
 * Companies enroll with an annual carbon offset target. A background job
 * (or the API's `runAutoPurchase` path) buys credits automatically until
 * the target is met, respecting the monthly budget cap and preferred
 * projects. Every month a progress report is generated with documentation
 * suitable for ESG disclosure.
 */

import { getPool } from '@/lib/db/client';
import logger from '@/lib/logger';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface OffsetProgram {
  id: string;
  companyName: string;
  companyEmail: string;
  walletAddress: string;
  annualTargetTco2e: number;
  autoPurchase: boolean;
  monthlyBudgetCap: number | null;
  preferredProjects: string[];
  preferredTypes: string[];
  netZeroPledge: boolean;
  targetYear: number | null;
  status: 'active' | 'paused' | 'cancelled' | 'completed';
  createdAt: Date;
  updatedAt: Date;
}

export interface EnrollmentInput {
  companyName: string;
  companyEmail: string;
  walletAddress: string;
  annualTargetTco2e: number;
  autoPurchase?: boolean;
  monthlyBudgetCap?: number | null;
  preferredProjects?: string[];
  preferredTypes?: string[];
  netZeroPledge?: boolean;
  targetYear?: number | null;
}

export interface AutoPurchaseRun {
  programId: string;
  purchasedTco2e: number;
  spent: number;
  purchases: Array<{
    projectId: string;
    quantityTco2e: number;
    unitPrice: number;
    totalPrice: number;
    automated: boolean;
  }>;
  remainingToTarget: number;
  targetMet: boolean;
}

export interface MonthlyReport {
  programId: string;
  period: string; // YYYY-MM-01
  tonnesPurchased: number;
  tonnesCumulative: number;
  targetRemaining: number;
  pctOfTarget: number;
  amountSpent: number;
  projectsSupported: Array<{ projectId: string; tonnes: number }>;
  coBenefits: string[];
  onTrack: boolean;
}

// ── Enrollment ────────────────────────────────────────────────────────────────

export async function enrollCompany(input: EnrollmentInput): Promise<OffsetProgram> {
  if (input.annualTargetTco2e <= 0) {
    throw new Error('Annual target must be greater than zero');
  }

  const pool = getPool();
  const result = await pool.query(
    `INSERT INTO corporate_offset_programs
       (company_name, company_email, wallet_address, annual_target_tco2e,
        auto_purchase, monthly_budget_cap, preferred_projects, preferred_types,
        net_zero_pledge, target_year)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT (wallet_address) DO UPDATE
       SET company_name = EXCLUDED.company_name,
           company_email = EXCLUDED.company_email,
           annual_target_tco2e = EXCLUDED.annual_target_tco2e,
           auto_purchase = EXCLUDED.auto_purchase,
           monthly_budget_cap = EXCLUDED.monthly_budget_cap,
           preferred_projects = EXCLUDED.preferred_projects,
           preferred_types = EXCLUDED.preferred_types,
           net_zero_pledge = EXCLUDED.net_zero_pledge,
           target_year = EXCLUDED.target_year,
           status = 'active',
           updated_at = now()
     RETURNING *`,
    [
      input.companyName,
      input.companyEmail,
      input.walletAddress,
      input.annualTargetTco2e,
      input.autoPurchase ?? true,
      input.monthlyBudgetCap ?? null,
      input.preferredProjects ?? [],
      input.preferredTypes ?? [],
      input.netZeroPledge ?? false,
      input.targetYear ?? null,
    ]
  );
  return mapProgram(result.rows[0]);
}

export async function getProgramByWallet(walletAddress: string): Promise<OffsetProgram | null> {
  const pool = getPool();
  const result = await pool.query(
    'SELECT * FROM corporate_offset_programs WHERE wallet_address = $1',
    [walletAddress]
  );
  return result.rows[0] ? mapProgram(result.rows[0]) : null;
}

export async function setProgramStatus(
  walletAddress: string,
  status: OffsetProgram['status']
): Promise<OffsetProgram | null> {
  const pool = getPool();
  const result = await pool.query(
    `UPDATE corporate_offset_programs SET status = $2, updated_at = now()
     WHERE wallet_address = $1 RETURNING *`,
    [walletAddress, status]
  );
  return result.rows[0] ? mapProgram(result.rows[0]) : null;
}

// ── Progress ──────────────────────────────────────────────────────────────────

export async function getCumulativePurchases(programId: string): Promise<number> {
  const pool = getPool();
  const result = await pool.query(
    `SELECT COALESCE(SUM(quantity_tco2e), 0) AS total
     FROM corporate_offset_purchases WHERE program_id = $1`,
    [programId]
  );
  return Number(result.rows[0].total);
}

// ── Automated purchase engine ─────────────────────────────────────────────────

/**
 * Run one auto-purchase cycle for a program.
 *
 * `availableInventory` is the current marketplace supply: rows of
 * { projectId, quantityTco2e, unitPrice, projectType?, coBenefits? }.
 * The engine prefers the company's preferred projects/types, then fills by
 * lowest unit price, respecting `monthlyBudgetCap` and stopping once the
 * annual target is met.
 *
 * In production the actual credit purchase goes through
 * `/api/credits/batch-purchase` (#1328) so fees stay low; this function
 * records the program-level purchase ledger.
 */
export async function runAutoPurchase(
  walletAddress: string,
  availableInventory: Array<{
    projectId: string;
    quantityTco2e: number;
    unitPrice: number;
    projectType?: string;
    coBenefits?: string[];
  }>
): Promise<AutoPurchaseRun> {
  const program = await getProgramByWallet(walletAddress);
  if (!program) throw new Error('Program not enrolled');
  if (program.status !== 'active') throw new Error(`Program is ${program.status}`);

  const pool = getPool();
  const cumulative = await getCumulativePurchases(program.id);
  const remaining = program.annualTargetTco2e - cumulative;

  // Month-to-date spend for budget enforcement.
  const spendResult = await pool.query(
    `SELECT COALESCE(SUM(total_price), 0) AS spent
     FROM corporate_offset_purchases
     WHERE program_id = $1 AND purchase_date >= date_trunc('month', now())`,
    [program.id]
  );
  const monthSpend = Number(spendResult.rows[0].spent);

  if (remaining <= 0) {
    if (program.status !== 'completed') {
      await setProgramStatus(walletAddress, 'completed');
    }
    return {
      programId: program.id,
      purchasedTco2e: 0,
      spent: 0,
      purchases: [],
      remainingToTarget: 0,
      targetMet: true,
    };
  }
  if (!program.autoPurchase) {
    return {
      programId: program.id,
      purchasedTco2e: 0,
      spent: 0,
      purchases: [],
      remainingToTarget: remaining,
      targetMet: false,
    };
  }

  // Rank inventory: preferred projects first, then preferred types, then price.
  const ranked = [...availableInventory]
    .map((inv) => ({
      ...inv,
      score:
        (program.preferredProjects.includes(inv.projectId) ? 2 : 0) +
        (inv.projectType && program.preferredTypes.includes(inv.projectType) ? 1 : 0),
    }))
    .sort((a, b) => (b.score !== a.score ? b.score - a.score : a.unitPrice - b.unitPrice));

  let remainingBudget =
    program.monthlyBudgetCap !== null
      ? program.monthlyBudgetCap - monthSpend
      : Number.POSITIVE_INFINITY;
  let toBuy = remaining;

  const purchases: AutoPurchaseRun['purchases'] = [];
  for (const inv of ranked) {
    if (toBuy <= 0 || remainingBudget <= 0) break;
    if (inv.quantityTco2e <= 0 || inv.unitPrice < 0) continue;

    const qty = Math.min(toBuy, inv.quantityTco2e);
    const cost = qty * inv.unitPrice;
    if (cost > remainingBudget) {
      // Partial fill within remaining budget.
      const affordableQty = Math.floor(remainingBudget / inv.unitPrice);
      if (affordableQty <= 0) continue;
      const affordableCost = affordableQty * inv.unitPrice;
      purchases.push({
        projectId: inv.projectId,
        quantityTco2e: affordableQty,
        unitPrice: inv.unitPrice,
        totalPrice: affordableCost,
        automated: true,
      });
      toBuy -= affordableQty;
      remainingBudget -= affordableCost;
    } else {
      purchases.push({
        projectId: inv.projectId,
        quantityTco2e: qty,
        unitPrice: inv.unitPrice,
        totalPrice: cost,
        automated: true,
      });
      toBuy -= qty;
      remainingBudget -= cost;
    }
  }

  let purchased = 0;
  let spent = 0;
  for (const p of purchases) {
    await pool.query(
      `INSERT INTO corporate_offset_purchases
         (program_id, project_id, quantity_tco2e, unit_price, total_price, automated)
       VALUES ($1,$2,$3,$4,$5,TRUE)`,
      [program.id, p.projectId, p.quantityTco2e, p.unitPrice, p.totalPrice]
    );
    purchased += p.quantityTco2e;
    spent += p.totalPrice;
  }

  const newCumulative = cumulative + purchased;
  if (newCumulative >= program.annualTargetTco2e) {
    await setProgramStatus(walletAddress, 'completed');
  }

  logger.info('[corporate-offset] auto-purchase run complete', {
    programId: program.id,
    purchased,
    spent,
  });

  return {
    programId: program.id,
    purchasedTco2e: purchased,
    spent,
    purchases,
    remainingToTarget: Math.max(program.annualTargetTco2e - newCumulative, 0),
    targetMet: newCumulative >= program.annualTargetTco2e,
  };
}

// ── Monthly reporting ─────────────────────────────────────────────────────────

/**
 * Generate (or refresh) the monthly report for a program.
 * Period defaults to the month preceding `now`.
 */
export async function generateMonthlyReport(
  walletAddress: string,
  period?: string
): Promise<MonthlyReport> {
  const program = await getProgramByWallet(walletAddress);
  if (!program) throw new Error('Program not enrolled');

  const pool = getPool();
  const periodDate = period ? `${period}-01` : null;

  const rowsResult = await pool.query(
    `SELECT project_id,
            SUM(quantity_tco2e) AS tonnes,
            SUM(total_price) AS spend
     FROM corporate_offset_purchases
     WHERE program_id = $1
       AND ($2::date IS NULL OR date_trunc('month', purchase_date) = $2::date)
     GROUP BY project_id`,
    [program.id, periodDate]
  );

  const periodRows = periodDate
    ? rowsResult.rows
    : await pool
        .query(
          `SELECT project_id,
                SUM(quantity_tco2e) AS tonnes,
                SUM(total_price) AS spend
         FROM corporate_offset_purchases
         WHERE program_id = $1
           AND date_trunc('month', purchase_date) = date_trunc('month', now()) - interval '1 month'
         GROUP BY project_id`,
          [program.id]
        )
        .then((r: { rows: Array<Record<string, unknown>> }) => r.rows);

  const tonnesPurchased = periodRows.reduce(
    (sum: number, r: Record<string, unknown>) => sum + Number(r.tonnes),
    0
  );
  const amountSpent = periodRows.reduce(
    (sum: number, r: Record<string, unknown>) => sum + Number(r.spend),
    0
  );
  const cumulative = await getCumulativePurchases(program.id);
  const targetRemaining = Math.max(program.annualTargetTco2e - cumulative, 0);
  const pctOfTarget =
    program.annualTargetTco2e > 0
      ? Math.min((cumulative / program.annualTargetTco2e) * 100, 100)
      : 0;

  const projectsSupported = periodRows.map((r: Record<string, unknown>) => ({
    projectId: String(r.project_id),
    tonnes: Number(r.tonnes),
  }));

  // Expected monthly pace: annual target spread evenly; on-track if the
  // cumulative total covers elapsed months of the year.
  const now = new Date();
  const elapsedMonths = periodDate ? 1 : now.getMonth() + 1;
  const expectedPct = (elapsedMonths / 12) * 100;
  const onTrack = pctOfTarget >= expectedPct * 0.9; // 10% grace band

  const reportPeriod =
    periodDate ?? `${now.getFullYear()}-${String(now.getMonth()).padStart(2, '0')}-01`;

  // Persist the report (idempotent per program+period).
  await pool.query(
    `INSERT INTO corporate_offset_reports
       (program_id, report_period, tonnes_purchased, tonnes_cumulative,
        target_remaining, pct_of_target, amount_spent, projects_supported, co_benefits)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb)
     ON CONFLICT (program_id, report_period) DO UPDATE
       SET tonnes_purchased = EXCLUDED.tonnes_purchased,
           tonnes_cumulative = EXCLUDED.tonnes_cumulative,
           target_remaining = EXCLUDED.target_remaining,
           pct_of_target = EXCLUDED.pct_of_target,
           amount_spent = EXCLUDED.amount_spent,
           projects_supported = EXCLUDED.projects_supported,
           co_benefits = EXCLUDED.co_benefits,
           generated_at = now()`,
    [
      program.id,
      reportPeriod,
      tonnesPurchased,
      cumulative,
      targetRemaining,
      pctOfTarget.toFixed(2),
      amountSpent,
      JSON.stringify(projectsSupported),
      JSON.stringify(program.preferredTypes),
    ]
  );

  return {
    programId: program.id,
    period: reportPeriod,
    tonnesPurchased,
    tonnesCumulative: cumulative,
    targetRemaining,
    pctOfTarget,
    amountSpent,
    projectsSupported,
    coBenefits: program.preferredTypes,
    onTrack,
  };
}

// ── Mapping ───────────────────────────────────────────────────────────────────

function mapProgram(row: Record<string, unknown>): OffsetProgram {
  return {
    id: String(row.id),
    companyName: String(row.company_name),
    companyEmail: String(row.company_email),
    walletAddress: String(row.wallet_address),
    annualTargetTco2e: Number(row.annual_target_tco2e),
    autoPurchase: Boolean(row.auto_purchase),
    monthlyBudgetCap: row.monthly_budget_cap === null ? null : Number(row.monthly_budget_cap),
    preferredProjects: (row.preferred_projects as string[]) ?? [],
    preferredTypes: (row.preferred_types as string[]) ?? [],
    netZeroPledge: Boolean(row.net_zero_pledge),
    targetYear: row.target_year === null ? null : Number(row.target_year),
    status: row.status as OffsetProgram['status'],
    createdAt: new Date(String(row.created_at)),
    updatedAt: new Date(String(row.updated_at)),
  };
}
