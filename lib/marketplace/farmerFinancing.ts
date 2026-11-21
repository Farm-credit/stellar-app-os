/**
 * Farmer Financing - Credit Lines for Land Prep — Issues #1352 (v1), #1414 (v2)
 *
 * Provides financing for farmers to prepare land for carbon projects.
 * Repayment comes from first carbon credit sales. 0% interest.
 *
 * v2 adds:
 * - Underwriting: when the farmer supplies land size, region and practice, the
 *   credit limit is sized from the *low* scenario of the income prediction
 *   (issue #1421) over the first sales, so a line never assumes best-case prices.
 * - Repayment from carbon credit sales: each recorded sale sweeps a fixed share
 *   of its proceeds into the line until it is repaid; the rest goes to the
 *   farmer. A sale reference can only be applied once per line.
 */

import type { CarbonRegion } from '@/lib/api/carbon-prices';
import {
  parseIncomePredictionInput,
  predictFarmerIncome,
  type FarmingPractice,
} from '@/lib/api/farmer-income-prediction';

// ── Terms ─────────────────────────────────────────────────────────────────────

/** Credit lines are always interest free. */
export const LAND_PREP_INTEREST_RATE = 0.0;
/** Hard cap on any single land-prep credit line, in USD. */
export const MAX_CREDIT_LINE_USD = 25_000;
/** Share of each carbon credit sale swept into repayment (basis points). */
export const DEFAULT_REPAYMENT_SHARE_BPS = 5_000;
/** Years of first carbon sales a credit line may be repaid from. */
export const UNDERWRITING_HORIZON_YEARS = 3;
/** Share of projected (low-scenario) first-sales income that may be advanced. */
export const UNDERWRITING_ADVANCE_RATE = 0.5;

export interface CreditLineRepayment {
  /** Reference of the carbon credit sale the repayment came from. */
  saleReference: string;
  saleProceeds: number;
  amountApplied: number;
  farmerPayout: number;
  recordedAt: string;
}

export interface LandPrepCreditLine {
  id: string;
  farmerId: string;
  farmerName: string;
  projectName: string;
  location: string;
  requestedAmount: number; // in USD
  approvedAmount: number; // in USD
  disbursedAmount: number;
  repaidAmount: number;
  /** `disbursedAmount - repaidAmount`; interest never accrues. */
  outstandingAmount: number;
  status: 'Pending' | 'Active' | 'Repaid' | 'Defaulted';
  interestRate: number; // 0%
  repaymentTerms: string;
  /** Share of each carbon credit sale applied to the line (basis points). */
  repaymentShareBps: number;
  /** Credit limit the line was underwritten against. */
  creditLimit: number;
  carbonProjectLinkedId: string;
  landSizeHectares?: number;
  region?: CarbonRegion;
  practiceType?: FarmingPractice;
  repayments: CreditLineRepayment[];
  createdAt: string;
}

export class FinancingError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409 | 422
  ) {
    super(message);
    this.name = 'FinancingError';
  }
}

export const mockLandPrepCreditLines: LandPrepCreditLine[] = [
  {
    id: 'cc-line-001',
    farmerId: 'farmer-kwame',
    farmerName: 'Kwame Mensah',
    projectName: 'Northern Ghana Agroforestry & Land Prep',
    location: 'Tamale, Northern Ghana',
    requestedAmount: 5000,
    approvedAmount: 5000,
    disbursedAmount: 5000,
    repaidAmount: 0,
    outstandingAmount: 5000,
    status: 'Active',
    interestRate: 0.0,
    repaymentTerms: 'Repaid automatically from first carbon credit sales (v1)',
    repaymentShareBps: DEFAULT_REPAYMENT_SHARE_BPS,
    creditLimit: MAX_CREDIT_LINE_USD,
    carbonProjectLinkedId: 'listing-005',
    landSizeHectares: 20,
    region: 'africa',
    practiceType: 'agroforestry',
    repayments: [],
    createdAt: '2024-02-25T08:00:00Z',
  },
  {
    id: 'cc-line-002',
    farmerId: 'farmer-amina',
    farmerName: 'Amina Diallo',
    projectName: 'Sahel Regreening Initiative',
    location: 'Kano, Nigeria',
    requestedAmount: 3500,
    approvedAmount: 3500,
    disbursedAmount: 3500,
    repaidAmount: 3500,
    outstandingAmount: 0,
    status: 'Repaid',
    interestRate: 0.0,
    repaymentTerms: 'Repaid from first carbon credit sales',
    repaymentShareBps: DEFAULT_REPAYMENT_SHARE_BPS,
    creditLimit: MAX_CREDIT_LINE_USD,
    carbonProjectLinkedId: 'listing-008',
    repayments: [
      {
        saleReference: 'sale-2024-0612',
        saleProceeds: 7000,
        amountApplied: 3500,
        farmerPayout: 3500,
        recordedAt: '2024-06-12T10:00:00Z',
      },
    ],
    createdAt: '2024-01-10T09:30:00Z',
  },
];

function roundUsd(value: number): number {
  return Math.round(value * 100) / 100;
}

function repaymentTerms(shareBps: number): string {
  return `0% interest. Repaid from first carbon credit sales (${shareBps / 100}% of each sale until cleared).`;
}

// ── Underwriting ──────────────────────────────────────────────────────────────

export interface LandProfile {
  landSizeHectares: number;
  region: CarbonRegion;
  practiceType: FarmingPractice;
}

export interface CreditLimitQuote {
  creditLimit: number;
  /** Low-scenario farmer income over the underwriting horizon, in USD. */
  projectedFirstSalesIncome: number;
  horizonYears: number;
  advanceRate: number;
  maxCreditLine: number;
}

/**
 * Size a credit line from the land's projected first carbon sales.
 *
 * Uses the low price scenario so repayment still clears if prices sit at the
 * bottom of their recent range.
 */
export function calculateLandPrepCreditLimit(
  profile: LandProfile,
  now: Date = new Date()
): CreditLimitQuote {
  const prediction = predictFarmerIncome(
    { ...profile, projectYears: UNDERWRITING_HORIZON_YEARS },
    now
  );
  const projected = prediction.totals.income.low;
  return {
    creditLimit: Math.min(MAX_CREDIT_LINE_USD, Math.floor(projected * UNDERWRITING_ADVANCE_RATE)),
    projectedFirstSalesIncome: projected,
    horizonYears: UNDERWRITING_HORIZON_YEARS,
    advanceRate: UNDERWRITING_ADVANCE_RATE,
    maxCreditLine: MAX_CREDIT_LINE_USD,
  };
}

/**
 * Validate optional land details. Returns `undefined` when none were supplied,
 * the parsed profile when all were, or throws when they are partial/invalid.
 */
export function parseLandProfile(raw: {
  landSizeHectares?: unknown;
  region?: unknown;
  practiceType?: unknown;
}): LandProfile | undefined {
  const supplied = [raw.landSizeHectares, raw.region, raw.practiceType].filter(
    (value) => value !== undefined && value !== null && value !== ''
  );
  if (supplied.length === 0) return undefined;

  const parsed = parseIncomePredictionInput({
    landSizeHectares: raw.landSizeHectares,
    region: raw.region,
    practiceType: raw.practiceType,
  });
  if (!parsed.ok) throw new FinancingError(parsed.errors.join('; '), 400);

  const { landSizeHectares, region, practiceType } = parsed.data;
  return { landSizeHectares, region, practiceType };
}

// ── Credit lines ──────────────────────────────────────────────────────────────

export function getFarmerCreditLines(farmerId?: string): LandPrepCreditLine[] {
  if (!farmerId) return mockLandPrepCreditLines;
  return mockLandPrepCreditLines.filter((l) => l.farmerId === farmerId);
}

export function getCreditLine(id: string): LandPrepCreditLine {
  const line = mockLandPrepCreditLines.find((l) => l.id === id);
  if (!line) throw new FinancingError(`Credit line ${id} not found`, 404);
  return line;
}

export function applyForLandPrepCredit(
  input: {
    farmerId: string;
    farmerName: string;
    projectName: string;
    location: string;
    requestedAmount: number;
    carbonProjectLinkedId: string;
    land?: LandProfile;
  },
  now: Date = new Date()
): LandPrepCreditLine {
  if (!Number.isFinite(input.requestedAmount) || input.requestedAmount <= 0) {
    throw new FinancingError('requestedAmount must be a positive number', 400);
  }

  const creditLimit = input.land
    ? calculateLandPrepCreditLimit(input.land, now).creditLimit
    : MAX_CREDIT_LINE_USD;
  if (creditLimit <= 0) {
    throw new FinancingError(
      'Projected carbon income for this land is too low to support a credit line',
      422
    );
  }

  // 0% interest, instant approval up to the underwritten limit.
  const approvedAmount = roundUsd(Math.min(input.requestedAmount, creditLimit));
  const newLine: LandPrepCreditLine = {
    id: `cc-line-${now.getTime()}-${mockLandPrepCreditLines.length + 1}`,
    farmerId: input.farmerId,
    farmerName: input.farmerName,
    projectName: input.projectName,
    location: input.location,
    requestedAmount: input.requestedAmount,
    approvedAmount,
    disbursedAmount: approvedAmount,
    repaidAmount: 0,
    outstandingAmount: approvedAmount,
    status: 'Active',
    interestRate: LAND_PREP_INTEREST_RATE,
    repaymentTerms: repaymentTerms(DEFAULT_REPAYMENT_SHARE_BPS),
    repaymentShareBps: DEFAULT_REPAYMENT_SHARE_BPS,
    creditLimit,
    carbonProjectLinkedId: input.carbonProjectLinkedId,
    ...input.land,
    repayments: [],
    createdAt: now.toISOString(),
  };
  mockLandPrepCreditLines.unshift(newLine);
  return newLine;
}

// ── Repayment from carbon credit sales ────────────────────────────────────────

export interface CarbonSaleRepaymentResult {
  creditLine: LandPrepCreditLine;
  /** Portion of the sale applied to the credit line. */
  repaymentApplied: number;
  /** Portion of the sale paid out to the farmer. */
  farmerPayout: number;
}

/**
 * Apply a carbon credit sale to a credit line: `repaymentShareBps` of the
 * proceeds (capped at the outstanding balance) repays the line, and the rest
 * is paid to the farmer. Once the balance hits zero the line is `Repaid` and
 * later sales go entirely to the farmer.
 */
export function recordCarbonSaleRepayment(
  lineId: string,
  sale: { saleReference: string; saleProceeds: number },
  now: Date = new Date()
): CarbonSaleRepaymentResult {
  const line = getCreditLine(lineId);

  if (typeof sale.saleReference !== 'string' || !sale.saleReference.trim()) {
    throw new FinancingError('saleReference is required', 400);
  }
  if (!Number.isFinite(sale.saleProceeds) || sale.saleProceeds <= 0) {
    throw new FinancingError('saleProceeds must be a positive number', 400);
  }
  if (line.status !== 'Active') {
    throw new FinancingError(`Credit line ${lineId} is ${line.status}, not Active`, 409);
  }
  if (line.repayments.some((r) => r.saleReference === sale.saleReference)) {
    throw new FinancingError(`Sale ${sale.saleReference} was already applied to ${lineId}`, 409);
  }

  const share = roundUsd((sale.saleProceeds * line.repaymentShareBps) / 10_000);
  const amountApplied = Math.min(line.outstandingAmount, share);
  const farmerPayout = roundUsd(sale.saleProceeds - amountApplied);

  line.repaidAmount = roundUsd(line.repaidAmount + amountApplied);
  line.outstandingAmount = roundUsd(line.disbursedAmount - line.repaidAmount);
  if (line.outstandingAmount <= 0) {
    line.outstandingAmount = 0;
    line.status = 'Repaid';
  }
  line.repayments.push({
    saleReference: sale.saleReference,
    saleProceeds: sale.saleProceeds,
    amountApplied,
    farmerPayout,
    recordedAt: now.toISOString(),
  });

  return { creditLine: line, repaymentApplied: amountApplied, farmerPayout };
}
