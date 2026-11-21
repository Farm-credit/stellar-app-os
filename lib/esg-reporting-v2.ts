/**
 * ESG Compliance Reporting v2 — Issue #1407
 *
 * Extends v1 ESG disclosure helpers with a buyer-facing compliance report
 * that aggregates carbon offset purchases, co-benefits achieved, and supply
 * chain impact from real buyer analytics data. Includes structured PDF and
 * Excel exports with explicit disclaimers (no compliance framework claims).
 *
 * This module is framework-agnostic: it builds report objects from
 * BuyerAnalyticsSummary; rendering/export is delegated to separate utilities.
 */

import type { BuyerAnalyticsSummary, SupplyChainProject } from '@/lib/api/buyer-analytics';

export type { SupplyChainProject, SupplyChainStage } from '@/lib/api/buyer-analytics';

// ─────────────────────────────────────────────────────────────────────────────
// Report Data Models
// ─────────────────────────────────────────────────────────────────────────────

export type ReportFormat = 'json' | 'pdf' | 'xlsx';
export type ReportPeriodType = 'month' | 'quarter' | 'custom';

/** Human-readable period label: "Jan 2026", "Q1 2026", etc. */
export interface ReportPeriod {
  type: ReportPeriodType;
  label: string;
  start: string; // ISO 8601
  end: string; // ISO 8601
}

/** Per-project carbon offset purchase line item. */
export interface CarbonOffsetLineItem {
  projectId: string;
  projectName: string;
  tonnes: number;
  costUsd: number;
  costPerTonUsd: number;
  purchaseCount: number;
  status: 'active' | 'retired' | 'mixed';
  retiredTonnes: number;
  firstPurchasedAt: string; // ISO 8601
  lastPurchasedAt: string; // ISO 8601
  retirementDate?: string; // ISO 8601, if fully retired
  verification: string; // e.g., 'Verra (VCS)', 'Gold Standard'
}

/** Carbon offset purchases section of the report. */
export interface CarbonOffsetsSection {
  totalTonnes: number;
  activeTonnes: number;
  retiredTonnes: number;
  totalCostUsd: number;
  costPerTonUsd: number;
  purchaseCount: number;
  projectCount: number;
  lineItems: CarbonOffsetLineItem[];
}

/** Co-benefit line in the report. */
export interface CoBenefitLine {
  name: string;
  projectCount: number;
  tonnes: number;
  sharePercentage: number;
}

/** Co-benefits achieved section of the report. */
export interface CoBenefitsSection {
  topBenefits: CoBenefitLine[]; // Top 5 by tonnes
  allBenefits: CoBenefitLine[];
  totalBenefitInstances: number; // Sum of projectCounts across unique benefits
}

/** Supply chain section of the report. */
export interface SupplyChainSection {
  projectCount: number;
  projects: SupplyChainProject[];
  avgDaysToRetirement: number | null; // Null if no retirements yet
  retirementRate: number; // Percentage: retiredTonnes / totalTonnes * 100
  stageCompletionSummary: {
    origination: number; // % of projects
    verification: number; // % of projects
    issuance: number; // % of projects
    purchase: number; // % of projects
    retirement: number; // % of projects (credit projects only)
  };
}

/** Complete buyer compliance report. */
export interface BuyerComplianceReport {
  reportId: string;
  generatedAt: string; // ISO 8601
  buyerId: string;
  companyName: string;
  period: ReportPeriod;
  carbonOffsets: CarbonOffsetsSection;
  coBenefits: CoBenefitsSection;
  supplyChain: SupplyChainSection;
  disclaimers: string[];
}

/** API response envelope for report endpoint. */
export interface BuyerComplianceReportResponse {
  report: BuyerComplianceReport;
  generated: string; // ISO 8601
  disclaimer: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function roundTonnes(value: number): number {
  return parseFloat(value.toFixed(4));
}

function roundUsd(value: number): number {
  return parseFloat(value.toFixed(2));
}

function roundPct(value: number): number {
  return parseFloat(value.toFixed(2));
}

/**
 * Generates a unique report ID from buyer ID and period.
 * Format: ESG-BUYER-{buyerId}-{periodLabel}
 */
export function buildReportId(buyerId: string, period: ReportPeriod): string {
  const buyerSlug = buyerId
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .slice(0, 16);
  const periodSlug = period.label
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '')
    .slice(0, 12);
  return `ESG-${buyerSlug}-${periodSlug || 'PERIOD'}`;
}

/**
 * Builds a human-readable period label from ISO dates.
 */
export function buildPeriodLabel(start: string, end: string, type: ReportPeriodType): string {
  const startDate = new Date(start);
  const endDate = new Date(end);

  if (type === 'month') {
    const month = startDate.toLocaleString('en-US', { month: 'short', year: 'numeric' });
    return month;
  }

  if (type === 'quarter') {
    const quarter = Math.floor(startDate.getUTCMonth() / 3) + 1;
    const year = startDate.getUTCFullYear();
    return `Q${quarter} ${year}`;
  }

  const start_ = startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const end_ = endDate.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  return `${start_} - ${end_}`;
}

/**
 * Builds the carbon offsets section from buyer analytics.
 */
function buildCarbonOffsetsSection(analytics: BuyerAnalyticsSummary): CarbonOffsetsSection {
  const lineItems = analytics.supplyChain.map((project) => {
    const status: 'active' | 'retired' | 'mixed' =
      project.retiredTonnes === 0
        ? 'active'
        : project.retiredTonnes >= project.tonnes - 1e-9
          ? 'retired'
          : 'mixed';

    return {
      projectId: project.projectId,
      projectName: project.projectName,
      tonnes: roundTonnes(project.tonnes),
      costUsd: roundUsd(project.costUsd),
      costPerTonUsd: roundUsd(project.costPerTonUsd),
      purchaseCount: project.purchaseCount,
      status,
      retiredTonnes: roundTonnes(project.retiredTonnes),
      firstPurchasedAt: project.firstPurchasedAt,
      lastPurchasedAt: project.lastPurchasedAt,
      retirementDate: project.lastPurchasedAt, // Placeholder; ideally from retirement data
      verification: project.platform,
    } satisfies CarbonOffsetLineItem;
  });

  return {
    totalTonnes: roundTonnes(analytics.totals.totalTonnes),
    activeTonnes: roundTonnes(analytics.totals.activeTonnes),
    retiredTonnes: roundTonnes(analytics.totals.retiredTonnes),
    totalCostUsd: roundUsd(analytics.totals.totalCostUsd),
    costPerTonUsd: roundUsd(analytics.totals.costPerTonUsd),
    purchaseCount: analytics.totals.purchaseCount,
    projectCount: analytics.totals.projectCount,
    lineItems,
  };
}

/**
 * Builds the co-benefits section from buyer analytics.
 */
function buildCoBenefitsSection(analytics: BuyerAnalyticsSummary): CoBenefitsSection {
  const benefits: CoBenefitLine[] = analytics.coBenefits.map((benefit) => ({
    name: benefit.name,
    projectCount: benefit.projectCount,
    tonnes: roundTonnes(benefit.tonnes),
    sharePercentage: roundPct(benefit.sharePercentage),
  }));

  const topBenefits = benefits.slice(0, 5);
  const totalBenefitInstances = benefits.reduce((sum, b) => sum + b.projectCount, 0);

  return {
    topBenefits,
    allBenefits: benefits,
    totalBenefitInstances,
  };
}

/**
 * Calculates average days to retirement from purchase date.
 */
function calculateAvgDaysToRetirement(projects: SupplyChainProject[]): number | null {
  const retired = projects.filter((p) => p.retiredTonnes > 0);
  if (retired.length === 0) return null;

  const totalDays = retired.reduce((sum, project) => {
    const purchase = new Date(project.firstPurchasedAt);
    const retirement = new Date(project.lastPurchasedAt); // Placeholder
    const days = (retirement.getTime() - purchase.getTime()) / (1000 * 60 * 60 * 24);
    return sum + days;
  }, 0);

  return Math.round(totalDays / retired.length);
}

/**
 * Calculates the percentage of projects at each supply chain stage.
 */
function buildStageCompletionSummary(
  projects: SupplyChainProject[]
): SupplyChainSection['stageCompletionSummary'] {
  if (projects.length === 0) {
    return {
      origination: 0,
      verification: 0,
      issuance: 0,
      purchase: 0,
      retirement: 0,
    };
  }

  const stages: Record<string, number> = {
    origination: 0,
    verification: 0,
    issuance: 0,
    purchase: 0,
    retirement: 0,
  };

  for (const project of projects) {
    for (const stage of project.stages) {
      if (stage.status === 'complete') {
        stages[stage.stage] = (stages[stage.stage] ?? 0) + 1;
      }
    }
  }

  const total = projects.length;
  return {
    origination: roundPct((stages.origination / total) * 100),
    verification: roundPct((stages.verification / total) * 100),
    issuance: roundPct((stages.issuance / total) * 100),
    purchase: roundPct((stages.purchase / total) * 100),
    retirement: roundPct((stages.retirement / total) * 100),
  };
}

/**
 * Builds the supply chain section from buyer analytics.
 */
function buildSupplyChainSection(analytics: BuyerAnalyticsSummary): SupplyChainSection {
  const totalTonnes = analytics.totals.totalTonnes;
  const retiredTonnes = analytics.totals.retiredTonnes;
  const retirementRate = totalTonnes > 0 ? (retiredTonnes / totalTonnes) * 100 : 0;

  return {
    projectCount: analytics.totals.projectCount,
    projects: analytics.supplyChain,
    avgDaysToRetirement: calculateAvgDaysToRetirement(analytics.supplyChain),
    retirementRate: roundPct(retirementRate),
    stageCompletionSummary: buildStageCompletionSummary(analytics.supplyChain),
  };
}

/**
 * Builds standard disclaimers for the report.
 */
function buildDisclaimers(): string[] {
  return [
    'This report aggregates your carbon offset purchases and verified co-benefits from partner projects.',
    'It is not validated against any specific compliance standard (GHG Protocol, ISSB, CSRD, or similar).',
    'For regulatory or compliance attestation, consult your carbon verification partner or auditor.',
    'Data is current as of the report generation date and may not reflect real-time position changes.',
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Builds a complete buyer compliance report from buyer analytics.
 * Transforms the aggregated offset positions into a structured, exportable report.
 */
export function buildBuyerComplianceReport(
  analytics: BuyerAnalyticsSummary,
  companyName: string,
  periodType: ReportPeriodType = 'month'
): BuyerComplianceReport {
  const from = analytics.filters.from || new Date().toISOString().split('T')[0];
  const to = analytics.filters.to || new Date().toISOString().split('T')[0];
  const period: ReportPeriod = {
    type: periodType,
    label: buildPeriodLabel(from, to, periodType),
    start: from,
    end: to,
  };

  const reportId = buildReportId(analytics.buyerId, period);

  return {
    reportId,
    generatedAt: analytics.generatedAt,
    buyerId: analytics.buyerId,
    companyName: companyName.trim() || 'Unnamed Buyer',
    period,
    carbonOffsets: buildCarbonOffsetsSection(analytics),
    coBenefits: buildCoBenefitsSection(analytics),
    supplyChain: buildSupplyChainSection(analytics),
    disclaimers: buildDisclaimers(),
  };
}

/**
 * Generates a shareable/cacheable report URL path.
 */
export function buildReportSharePath(report: BuyerComplianceReport): string {
  return `/buyer-compliance-report/${report.reportId}`;
}

/**
 * Standard disclaimer text for all exports.
 */
export const REPORT_EXPORT_DISCLAIMER = `This report aggregates your carbon offset purchases and verified co-benefits from partner projects. It is not validated against any specific compliance standard (GHG Protocol, ISSB, CSRD, or similar). For regulatory or compliance attestation, consult your carbon verification partner or auditor.`;

/**
 * Validates a report object (useful for testing).
 */
export function isValidComplianceReport(report: unknown): boolean {
  if (typeof report !== 'object' || report === null) return false;
  const r = report as Record<string, unknown>;
  return (
    typeof r.reportId === 'string' &&
    typeof r.generatedAt === 'string' &&
    typeof r.buyerId === 'string' &&
    typeof r.companyName === 'string' &&
    typeof r.period === 'object' &&
    typeof r.carbonOffsets === 'object' &&
    typeof r.coBenefits === 'object' &&
    typeof r.supplyChain === 'object' &&
    Array.isArray(r.disclaimers)
  );
}
