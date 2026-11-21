import type { CreditHolding, OwnedCredit } from '@/lib/types/credits';

/**
 * Buyer portfolio view-model (issue #1385).
 *
 * `useCreditPortfolio` reads Stellar balances, which carry the project, vintage
 * quantity and a price — but not the *cost*, *retirement date*, or *co-benefits*
 * a buyer sees in their portfolio. This module is the single place that enriches
 * a raw `CreditHolding` into the buyer-facing shape so the dashboard and any
 * other consumer render identical data.
 */

export interface ProjectMetadata {
  /** Human-readable co-benefits (biodiversity, soil health, …). */
  coBenefits: string[];
}

/**
 * Static project metadata. In production this would be sourced from the
 * project registry; kept local here so the portfolio renders without an
 * additional round-trip and can be overridden by metadata carried on the
 * holding itself.
 */
export const PROJECT_METADATA: Record<string, ProjectMetadata> = {
  'PROJ-001': { coBenefits: ['biodiversity', 'community employment'] },
  'PROJ-002': { coBenefits: ['renewable energy', 'grid stability'] },
  'PROJ-003': { coBenefits: ['renewable energy', 'air quality'] },
  'PROJ-004': { coBenefits: ['biodiversity', 'coastal protection', 'soil health'] },
  'PROJ-005': { coBenefits: ['soil health', 'water efficiency'] },
};

/**
 * The buyer-facing holding shape lives with the other credit types so the hook,
 * the view and the API all agree on it; re-exported here for convenience.
 */
export type { OwnedCredit } from '@/lib/types/credits';

export interface OwnedCreditsSummary {
  credits: OwnedCredit[];
  totalCredits: number;
  totalCost: number;
  activeCredits: number;
  retiredCredits: number;
}

/** Co-benefits for a project id (empty when the project is unknown). */
export function coBenefitsFor(projectId: string): string[] {
  return PROJECT_METADATA[projectId]?.coBenefits ?? [];
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Enrich a single holding. Fields already present on the holding win over the
 * registry defaults so a contract-provided value is never overwritten.
 */
export function enrichHolding(holding: CreditHolding): OwnedCredit {
  const purchaseCost =
    typeof holding.purchaseCost === 'number'
      ? holding.purchaseCost
      : round2(holding.quantity * holding.pricePerTon);

  return {
    ...holding,
    purchaseCost,
    retirementDate: holding.retirementDate ?? null,
    coBenefits: holding.coBenefits ?? coBenefitsFor(holding.projectId),
  };
}

/** Build the full buyer portfolio view (list + totals). */
export function buildOwnedCreditsView(holdings: CreditHolding[]): OwnedCreditsSummary {
  const credits = holdings.map(enrichHolding);
  return {
    credits,
    totalCredits: round2(credits.reduce((sum, credit) => sum + credit.quantity, 0)),
    totalCost: round2(credits.reduce((sum, credit) => sum + credit.purchaseCost, 0)),
    activeCredits: credits.filter((credit) => credit.status === 'active').length,
    retiredCredits: credits.filter((credit) => credit.status === 'retired').length,
  };
}

/** Distinct co-benefits across a portfolio, sorted for stable rendering. */
export function portfolioCoBenefits(summary: OwnedCreditsSummary): string[] {
  return Array.from(new Set(summary.credits.flatMap((credit) => credit.coBenefits))).sort();
}
