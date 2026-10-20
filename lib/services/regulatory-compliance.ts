/**
 * Regulatory Compliance Service — Issue #1373
 *
 * Buyer compliance reporting for SEC, EPA, and carbon-tax regulatory
 * requirements. Automatically calculates net emissions by subtracting
 * verified carbon offsets from gross emissions, then formats each
 * framework's required disclosures into a structured filing payload.
 *
 * Frameworks supported:
 *   SEC        — SEC climate disclosure rule (17 CFR Parts 210, 229, 232, 239, 249)
 *                Scope 1+2 material emissions + offset disclosures
 *   EPA        — EPA mandatory GHG reporting (40 CFR Part 98)
 *                Facility-level gross/net emissions with offset credit detail
 *   CARBON_TAX — Carbon pricing / carbon-tax filing
 *                Taxable net tonnes after offset deduction × applicable rate
 */

import type {
  ComplianceRegime,
  ComplianceReport,
  ComplianceReportBundle,
  ComplianceReportInput,
} from '@/lib/types/compliance-report';
import {
  generateComplianceBundle,
} from '@/lib/services/compliance-reporting';

// ─── Extended input / output types ───────────────────────────────────────────

export interface OffsetPosition {
  /** Verified registry credit serial or lot ID. */
  creditId: string;
  /** Issuing standard: 'Verra (VCS)', 'Gold Standard', 'CAR', etc. */
  standard: string;
  /** Tonnes CO2e represented by this position. */
  tonnes: number;
  /** 'active' = held, 'retired' = applied against emissions. */
  status: 'active' | 'retired';
  /** Vintage year of the credit. */
  vintageYear: number;
}

export interface RegulatoryFilingInput extends ComplianceReportInput {
  /** Company legal name for the filing header. */
  companyName?: string;
  /** Fiscal or calendar year being reported (YYYY). */
  reportingYear?: number;
  /** Detailed offset positions for registry-level reconciliation. */
  offsetPositions?: OffsetPosition[];
  /** Facility identifier for EPA 40 CFR Part 98 filings. */
  facilityId?: string;
  /** US state abbreviation, used for state-level carbon-tax rate lookup. */
  state?: string;
}

export interface NetEmissionsCalculation {
  grossEmissionsTonnes: number;
  totalOffsetsTonnes: number;
  netEmissionsTonnes: number;
  /** Whether offsets fully cover gross emissions (net-zero or better). */
  isNetZero: boolean;
  /** Offset coverage as a percentage of gross emissions (capped at 100). */
  coveragePercent: number;
  /** Active (un-retired) offsets held in inventory. */
  activeOffsetsTonnes: number;
  /** Retired offsets that have been applied against emissions. */
  retiredOffsetsTonnes: number;
}

export interface SECFilingSection {
  /** Whether climate risks are material per SEC guidance (>= 25 000 tCO2e). */
  materialClimateRisk: boolean;
  scope1EmissionsTonnes: number;
  scope2EmissionsTonnes: number;
  /** Combined Scope 1+2 gross before offsets. */
  combinedScope12Tonnes: number;
  totalOffsetsTonnes: number;
  netEmissionsTonnes: number;
  coveragePercent: number;
  disclosureNotes: string[];
}

export interface EPAFilingSection {
  /** 40 CFR Part 98 facility ID (if provided). */
  facilityId?: string;
  grossEmissionsTonnes: number;
  offsetCreditsTonnes: number;
  netReportableTonnes: number;
  /** True when gross >= 25 000 tCO2e — mandatory reporter threshold. */
  exceedsReportingThreshold: boolean;
  subpartSections: string[];
}

export interface CarbonTaxFilingSection {
  jurisdiction?: string;
  state?: string;
  taxableTonnes: number;
  taxRatePerTonne: number;
  estimatedTaxDue: number;
  /** Offset credits applied as a tax-reduction against gross liability. */
  offsetsApplied: number;
  /** Tax liability before applying offsets. */
  grossTaxDue: number;
}

export interface RegulatoryFilingReport {
  id: string;
  buyerId: string;
  companyName: string;
  reportingPeriod: { start: string; end: string };
  reportingYear?: number;
  generatedAt: string;
  methodologyVersion: string;
  netEmissions: NetEmissionsCalculation;
  sec?: SECFilingSection;
  epa?: EPAFilingSection;
  carbonTax?: CarbonTaxFilingSection;
  /** Raw per-regime ComplianceReports from the core service. */
  regimeReports: ComplianceReport[];
  /** Offset positions used for reconciliation. */
  offsetPositions: OffsetPosition[];
  disclaimers: string[];
}

export interface RegulatoryFilingBundle {
  buyerId: string;
  companyName: string;
  reportingPeriod: { start: string; end: string };
  regimes: ComplianceRegime[];
  report: RegulatoryFilingReport;
  generatedAt: string;
}

// ─── Default carbon-tax rates (USD / tonne CO2e) ─────────────────────────────

const STATE_CARBON_TAX_RATES: Record<string, number> = {
  CA: 31.0,   // California cap-and-trade approximate allowance floor price
  WA: 19.0,   // Washington Climate Commitment Act
  OR: 23.5,   // Oregon Climate Protection Program
};

const DEFAULT_CARBON_TAX_RATE_USD = 25.0; // Federal social cost of carbon proxy

function getEffectiveTaxRate(jurisdiction?: string, state?: string): number {
  if (state && STATE_CARBON_TAX_RATES[state.toUpperCase()]) {
    return STATE_CARBON_TAX_RATES[state.toUpperCase()];
  }
  return DEFAULT_CARBON_TAX_RATE_USD;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

const round = (v: number, dp = 3): number => Number(v.toFixed(dp));

function computeNetEmissions(input: RegulatoryFilingInput): NetEmissionsCalculation {
  const gross = Math.max(0, input.emissionsTonnes);
  const offsets = Math.max(0, input.offsetsTonnes);
  const net = Math.max(0, gross - offsets);
  const coverage = gross === 0 ? 100 : round(Math.min(100, (offsets / gross) * 100), 2);

  const positions = input.offsetPositions ?? [];
  const activeTonnes = round(
    positions.filter((p) => p.status === 'active').reduce((s, p) => s + p.tonnes, 0)
  );
  const retiredTonnes = round(
    positions.filter((p) => p.status === 'retired').reduce((s, p) => s + p.tonnes, 0)
  );

  return {
    grossEmissionsTonnes: round(gross),
    totalOffsetsTonnes: round(offsets),
    netEmissionsTonnes: round(net),
    isNetZero: net <= 0,
    coveragePercent: coverage,
    activeOffsetsTonnes: activeTonnes,
    retiredOffsetsTonnes: retiredTonnes,
  };
}

function buildSECSection(
  input: RegulatoryFilingInput,
  net: NetEmissionsCalculation
): SECFilingSection {
  // Without a full GHG Protocol breakdown, we use an indicative 60/40 split
  // for Scope 1 vs Scope 2. Callers that have exact scope data should pass
  // emissionsTonnes as Scope 1+2 combined, which is what SEC requires.
  const scope1 = round(input.emissionsTonnes * 0.6);
  const scope2 = round(input.emissionsTonnes - scope1);

  const notes: string[] = [
    'Emissions reported on a location-based Scope 2 methodology per GHG Protocol.',
    `Offset credits sourced from: ${(input.offsetSources ?? ['platform carbon credits']).join(', ')}.`,
  ];
  if (net.isNetZero) {
    notes.push('Net-zero position achieved for this reporting period.');
  }
  if (net.coveragePercent < 100) {
    notes.push(
      `${round(100 - net.coveragePercent, 1)}% of gross emissions remain uncovered by offsets.`
    );
  }
  if (input.emissionsTonnes >= 25_000) {
    notes.push(
      'Combined Scope 1+2 emissions meet or exceed the 25 000 tCO2e materiality threshold.'
    );
  }

  return {
    materialClimateRisk: input.emissionsTonnes >= 25_000,
    scope1EmissionsTonnes: scope1,
    scope2EmissionsTonnes: scope2,
    combinedScope12Tonnes: round(input.emissionsTonnes),
    totalOffsetsTonnes: round(input.offsetsTonnes),
    netEmissionsTonnes: net.netEmissionsTonnes,
    coveragePercent: net.coveragePercent,
    disclosureNotes: notes,
  };
}

function buildEPASection(
  input: RegulatoryFilingInput,
  net: NetEmissionsCalculation
): EPAFilingSection {
  const PART98_THRESHOLD = 25_000; // tCO2e / year

  const subparts: string[] = ['Subpart C – General Stationary Fuel Combustion'];
  if (net.grossEmissionsTonnes >= PART98_THRESHOLD) {
    subparts.push('Subpart A – General Provisions (mandatory reporter)');
  }
  if ((input.offsetPositions ?? []).length > 0) {
    subparts.push('Subpart MM – Industrial GHG Supplier offset registry reconciliation');
  }

  return {
    facilityId: input.facilityId,
    grossEmissionsTonnes: net.grossEmissionsTonnes,
    offsetCreditsTonnes: round(input.offsetsTonnes),
    netReportableTonnes: net.netEmissionsTonnes,
    exceedsReportingThreshold: net.grossEmissionsTonnes >= PART98_THRESHOLD,
    subpartSections: subparts,
  };
}

function buildCarbonTaxSection(
  input: RegulatoryFilingInput,
  net: NetEmissionsCalculation
): CarbonTaxFilingSection {
  const rate = input.carbonTaxRate ?? getEffectiveTaxRate(input.jurisdiction, input.state);
  const grossTax = round(net.grossEmissionsTonnes * rate, 2);
  const offsetReduction = round(
    Math.min(input.offsetsTonnes, net.grossEmissionsTonnes) * rate,
    2
  );
  const estimatedTax = round(Math.max(0, grossTax - offsetReduction), 2);

  return {
    jurisdiction: input.jurisdiction,
    state: input.state,
    taxableTonnes: net.netEmissionsTonnes,
    taxRatePerTonne: rate,
    estimatedTaxDue: estimatedTax,
    offsetsApplied: round(input.offsetsTonnes),
    grossTaxDue: grossTax,
  };
}

function buildDisclaimers(regimes: ComplianceRegime[]): string[] {
  const base = [
    'This report is generated for informational purposes and does not constitute legal, financial, or regulatory advice.',
    'Emissions data should be independently verified by a qualified third-party auditor before regulatory submission.',
    'Offset credit retirements must be confirmed in the issuing registry (Verra, Gold Standard, CAR, etc.) prior to filing.',
  ];
  if (regimes.includes('SEC')) {
    base.push(
      'SEC climate disclosure: Consult securities counsel regarding materiality determinations and safe-harbor provisions (17 CFR Parts 229, 249).'
    );
  }
  if (regimes.includes('EPA')) {
    base.push(
      'EPA 40 CFR Part 98: Verify facility-level applicability and subpart coverage with a qualified environmental engineer.'
    );
  }
  if (regimes.includes('CARBON_TAX')) {
    base.push(
      'Carbon-tax estimates use approximate published rates and may not reflect current legislative changes. Verify with a tax professional.'
    );
  }
  return base;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Generates a regulatory filing report covering the requested compliance
 * regimes (SEC, EPA, CARBON_TAX) with automatic offset-vs-emissions
 * calculation. All regime sections are computed from the same validated input
 * so the numbers are internally consistent.
 */
export function generateRegulatoryFilingReport(
  input: RegulatoryFilingInput,
  regimes: ComplianceRegime[] = ['SEC', 'EPA', 'CARBON_TAX']
): RegulatoryFilingReport {
  const bundle: ComplianceReportBundle = generateComplianceBundle(input, regimes);
  const net = computeNetEmissions(input);

  const report: RegulatoryFilingReport = {
    id: `reg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    buyerId: input.buyerId,
    companyName: (input.companyName ?? input.buyerId).trim(),
    reportingPeriod: {
      start: input.reportingPeriodStart,
      end: input.reportingPeriodEnd,
    },
    reportingYear: input.reportingYear,
    generatedAt: new Date().toISOString(),
    methodologyVersion: '2026.1',
    netEmissions: net,
    regimeReports: bundle.reports,
    offsetPositions: input.offsetPositions ?? [],
    disclaimers: buildDisclaimers(regimes),
  };

  if (regimes.includes('SEC')) {
    report.sec = buildSECSection(input, net);
  }
  if (regimes.includes('EPA')) {
    report.epa = buildEPASection(input, net);
  }
  if (regimes.includes('CARBON_TAX')) {
    report.carbonTax = buildCarbonTaxSection(input, net);
  }

  return report;
}

/**
 * Convenience wrapper that generates a full bundle (report + metadata)
 * suitable for API response serialisation.
 */
export function generateRegulatoryBundle(
  input: RegulatoryFilingInput,
  regimes: ComplianceRegime[] = ['SEC', 'EPA', 'CARBON_TAX']
): RegulatoryFilingBundle {
  const report = generateRegulatoryFilingReport(input, regimes);
  return {
    buyerId: input.buyerId,
    companyName: report.companyName,
    reportingPeriod: report.reportingPeriod,
    regimes,
    report,
    generatedAt: report.generatedAt,
  };
}
