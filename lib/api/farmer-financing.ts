/**
 * Farmer financing service — Issue #1352
 *
 * Credit lines that let farmers pay for land preparation before their carbon
 * project earns revenue. Financing is 0% interest and is repaid automatically
 * from the proceeds of the farmer's first carbon credit sales.
 *
 * Persistence is an in-process Map (like the cooperative service); swap the
 * store for a database layer without changing callers.
 */

import type {
  ApplyForCreditLineInput,
  CreditLine,
  LandPrepPurpose,
  RecordCarbonSaleInput,
  RecordCarbonSaleResult,
} from '@/lib/types/farmer-financing';

export const MIN_CREDIT_LINE_USD = 50;
export const MAX_CREDIT_LINE_USD = 5_000;
export const CREDIT_LINE_INTEREST_PERCENT = 0;

export const LAND_PREP_PURPOSES: readonly LandPrepPurpose[] = [
  'clearing',
  'soil_preparation',
  'seedlings',
  'fencing',
  'irrigation',
  'other',
];

export class FinancingError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 400, code = 'invalid_request') {
    super(message);
    this.name = 'FinancingError';
    this.status = status;
    this.code = code;
  }
}

const store = new Map<string, CreditLine>();
let counter = 0;

const round2 = (n: number) => Math.round(n * 100) / 100;

export function resetFinancingStore(): void {
  store.clear();
  counter = 0;
}

function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}-${counter}`;
}

function mustGet(id: string): CreditLine {
  const line = store.get(id);
  if (!line) throw new FinancingError('Credit line not found', 404, 'not_found');
  return line;
}

export function applyForCreditLine(input: ApplyForCreditLineInput): CreditLine {
  if (!input?.farmerId?.trim()) throw new FinancingError('farmerId is required');
  if (!input.projectId?.trim()) throw new FinancingError('projectId is required');
  if (!LAND_PREP_PURPOSES.includes(input.purpose)) {
    throw new FinancingError('purpose must be a valid land preparation purpose');
  }
  if (
    typeof input.amountUsd !== 'number' ||
    !Number.isFinite(input.amountUsd) ||
    input.amountUsd < MIN_CREDIT_LINE_USD ||
    input.amountUsd > MAX_CREDIT_LINE_USD
  ) {
    throw new FinancingError(
      `amountUsd must be between ${MIN_CREDIT_LINE_USD} and ${MAX_CREDIT_LINE_USD}`
    );
  }

  const open = [...store.values()].some(
    (l) =>
      l.farmerId === input.farmerId &&
      (l.status === 'pending' || l.status === 'approved' || l.status === 'disbursed')
  );
  if (open) {
    throw new FinancingError('Farmer already has an open credit line', 409, 'conflict');
  }

  const now = new Date().toISOString();
  const principal = round2(input.amountUsd);
  const line: CreditLine = {
    id: nextId('credit'),
    farmerId: input.farmerId,
    projectId: input.projectId,
    purpose: input.purpose,
    principalUsd: principal,
    interestRatePercent: CREDIT_LINE_INTEREST_PERCENT,
    status: 'pending',
    repaidUsd: 0,
    outstandingUsd: principal,
    repayments: [],
    createdAt: now,
    updatedAt: now,
  };
  store.set(line.id, line);
  return line;
}

export function getCreditLine(id: string): CreditLine {
  return mustGet(id);
}

export function listCreditLines(filter: { farmerId?: string; status?: string } = {}): CreditLine[] {
  return [...store.values()].filter(
    (l) =>
      (!filter.farmerId || l.farmerId === filter.farmerId) &&
      (!filter.status || l.status === filter.status)
  );
}

function transition(id: string, from: CreditLine['status'], to: CreditLine['status']): CreditLine {
  const line = mustGet(id);
  if (line.status !== from) {
    throw new FinancingError(`Credit line must be ${from} (is ${line.status})`, 409, 'conflict');
  }
  line.status = to;
  line.updatedAt = new Date().toISOString();
  return line;
}

export const approveCreditLine = (id: string) => transition(id, 'pending', 'approved');
export const rejectCreditLine = (id: string) => transition(id, 'pending', 'rejected');
export const disburseCreditLine = (id: string) => transition(id, 'approved', 'disbursed');

/**
 * Applies a carbon credit sale to the farmer's disbursed credit line. The full
 * proceeds go to repayment until the balance is cleared; the rest is paid out.
 */
export function recordCarbonSale(id: string, input: RecordCarbonSaleInput): RecordCarbonSaleResult {
  if (!input?.saleId?.trim()) throw new FinancingError('saleId is required');
  if (
    typeof input.proceedsUsd !== 'number' ||
    !Number.isFinite(input.proceedsUsd) ||
    input.proceedsUsd <= 0
  ) {
    throw new FinancingError('proceedsUsd must be a positive number');
  }

  const line = mustGet(id);
  if (line.status !== 'disbursed') {
    throw new FinancingError('Credit line is not awaiting repayment', 409, 'conflict');
  }
  if (line.repayments.some((r) => r.saleId === input.saleId)) {
    throw new FinancingError('Sale already applied to this credit line', 409, 'conflict');
  }

  const repayment = round2(Math.min(input.proceedsUsd, line.outstandingUsd));
  line.repayments.push({
    id: nextId('repay'),
    saleId: input.saleId,
    amountUsd: repayment,
    createdAt: new Date().toISOString(),
  });
  line.repaidUsd = round2(line.repaidUsd + repayment);
  line.outstandingUsd = round2(line.principalUsd - line.repaidUsd);
  if (line.outstandingUsd === 0) line.status = 'repaid';
  line.updatedAt = new Date().toISOString();

  return {
    creditLine: line,
    repaymentUsd: repayment,
    farmerPayoutUsd: round2(input.proceedsUsd - repayment),
  };
}
