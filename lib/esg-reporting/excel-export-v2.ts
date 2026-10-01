/**
 * Excel export for buyer ESG compliance reports — Issue #1407
 *
 * Generates a multi-sheet Excel workbook with:
 * - Summary: Key metrics, company, period
 * - Carbon Offsets: Line-by-line purchase data
 * - Co-Benefits: Benefit aggregates (name, project count, tonnes, %)
 * - Supply Chain: Per-project chain of custody
 * - Disclaimer: Data freshness and compliance notes
 *
 * Uses xlsx library to create structured, filterable exports (not image-based).
 */

import * as XLSX from 'xlsx';
import type { BuyerComplianceReport } from '@/lib/esg-reporting-v2';
import { REPORT_EXPORT_DISCLAIMER } from '@/lib/esg-reporting-v2';

interface ExcelExportOptions {
  filename?: string;
}

const DEFAULT_FILENAME = 'buyer-esg-compliance-report.xlsx';

// ─────────────────────────────────────────────────────────────────────────────
// Sheet: Summary
// ─────────────────────────────────────────────────────────────────────────────

interface SummaryRow {
  Metric: string;
  Value: string | number;
}

function buildSummarySheet(report: BuyerComplianceReport): XLSX.WorkSheet {
  const data: SummaryRow[] = [
    { Metric: 'Report ID', Value: report.reportId },
    { Metric: 'Company Name', Value: report.companyName },
    { Metric: 'Reporting Period', Value: report.period.label },
    { Metric: 'Period Start', Value: report.period.start },
    { Metric: 'Period End', Value: report.period.end },
    { Metric: 'Generated At', Value: report.generatedAt },
    { Metric: '', Value: '' }, // Spacer
    { Metric: 'CARBON OFFSETS', Value: '' },
    { Metric: 'Total CO₂e Tonnes', Value: report.carbonOffsets.totalTonnes },
    { Metric: 'Active Tonnes', Value: report.carbonOffsets.activeTonnes },
    { Metric: 'Retired Tonnes', Value: report.carbonOffsets.retiredTonnes },
    { Metric: 'Total Cost (USD)', Value: report.carbonOffsets.totalCostUsd },
    { Metric: 'Cost per Tonne (USD)', Value: report.carbonOffsets.costPerTonUsd },
    { Metric: 'Number of Purchases', Value: report.carbonOffsets.purchaseCount },
    { Metric: 'Number of Projects', Value: report.carbonOffsets.projectCount },
    { Metric: '', Value: '' }, // Spacer
    { Metric: 'CO-BENEFITS', Value: '' },
    { Metric: 'Total Benefits Listed', Value: report.coBenefits.allBenefits.length },
    { Metric: 'Total Benefit Instances', Value: report.coBenefits.totalBenefitInstances },
    { Metric: '', Value: '' }, // Spacer
    { Metric: 'SUPPLY CHAIN', Value: '' },
    { Metric: 'Number of Projects', Value: report.supplyChain.projectCount },
    { Metric: 'Retirement Rate (%)', Value: report.supplyChain.retirementRate },
    { Metric: 'Avg Days to Retirement', Value: report.supplyChain.avgDaysToRetirement ?? 'N/A' },
    { Metric: 'Origination Complete (%)', Value: report.supplyChain.stageCompletionSummary.origination },
    { Metric: 'Verification Complete (%)', Value: report.supplyChain.stageCompletionSummary.verification },
    { Metric: 'Issuance Complete (%)', Value: report.supplyChain.stageCompletionSummary.issuance },
    { Metric: 'Purchase Complete (%)', Value: report.supplyChain.stageCompletionSummary.purchase },
    { Metric: 'Retirement Complete (%)', Value: report.supplyChain.stageCompletionSummary.retirement },
  ];

  const ws = XLSX.utils.json_to_sheet(data);
  ws.A1.s = { bold: true }; // Make first row bold
  ws['!cols'] = [{ wch: 30 }, { wch: 20 }];
  return ws;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sheet: Carbon Offsets
// ─────────────────────────────────────────────────────────────────────────────

interface CarbonOffsetsRow {
  'Project Name': string;
  'Tonnes CO₂e': number;
  'Total Cost (USD)': number;
  'Cost per Tonne (USD)': number;
  'Purchase Count': number;
  Status: string;
  'Retired Tonnes': number;
  'First Purchased': string;
  'Last Purchased': string;
  Verification: string;
}

function buildCarbonOffsetsSheet(report: BuyerComplianceReport): XLSX.WorkSheet {
  const data: CarbonOffsetsRow[] = report.carbonOffsets.lineItems.map((item) => ({
    'Project Name': item.projectName,
    'Tonnes CO₂e': item.tonnes,
    'Total Cost (USD)': item.costUsd,
    'Cost per Tonne (USD)': item.costPerTonUsd,
    'Purchase Count': item.purchaseCount,
    Status: item.status,
    'Retired Tonnes': item.retiredTonnes,
    'First Purchased': item.firstPurchasedAt.split('T')[0], // Date only
    'Last Purchased': item.lastPurchasedAt.split('T')[0], // Date only
    Verification: item.verification,
  }));

  const ws = XLSX.utils.json_to_sheet(data);
  ws['!cols'] = [
    { wch: 30 },
    { wch: 15 },
    { wch: 15 },
    { wch: 18 },
    { wch: 14 },
    { wch: 12 },
    { wch: 15 },
    { wch: 15 },
    { wch: 15 },
    { wch: 15 },
  ];
  return ws;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sheet: Co-Benefits
// ─────────────────────────────────────────────────────────────────────────────

interface CoBenefitsRow {
  Benefit: string;
  'Project Count': number;
  'Tonnes CO₂e': number;
  'Share of Total (%)': number;
}

function buildCoBenefitsSheet(report: BuyerComplianceReport): XLSX.WorkSheet {
  const data: CoBenefitsRow[] = report.coBenefits.allBenefits.map((benefit) => ({
    Benefit: benefit.name,
    'Project Count': benefit.projectCount,
    'Tonnes CO₂e': benefit.tonnes,
    'Share of Total (%)': benefit.sharePercentage,
  }));

  const ws = XLSX.utils.json_to_sheet(data);
  ws['!cols'] = [{ wch: 25 }, { wch: 15 }, { wch: 15 }, { wch: 18 }];
  return ws;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sheet: Supply Chain
// ─────────────────────────────────────────────────────────────────────────────

interface SupplyChainRow {
  'Project Name': string;
  Platform: string;
  'Asset Type': string;
  'Tonnes CO₂e': number;
  'Retired Tonnes': number;
  'Cost per Tonne (USD)': number;
  'First Purchased': string;
  'Last Purchased': string;
  'Co-Benefits': string;
  'Origination': string;
  Verification: string;
  Issuance: string;
  Purchase: string;
  Retirement: string;
}

function buildSupplyChainSheet(report: BuyerComplianceReport): XLSX.WorkSheet {
  const data: SupplyChainRow[] = report.supplyChain.projects.map((project) => {
    const originationStage = project.stages.find((s) => s.stage === 'origination');
    const verificationStage = project.stages.find((s) => s.stage === 'verification');
    const issuanceStage = project.stages.find((s) => s.stage === 'issuance');
    const purchaseStage = project.stages.find((s) => s.stage === 'purchase');
    const retirementStage = project.stages.find((s) => s.stage === 'retirement');

    return {
      'Project Name': project.projectName,
      Platform: project.platform,
      'Asset Type': project.assetType,
      'Tonnes CO₂e': project.tonnes,
      'Retired Tonnes': project.retiredTonnes,
      'Cost per Tonne (USD)': project.costPerTonUsd,
      'First Purchased': project.firstPurchasedAt.split('T')[0],
      'Last Purchased': project.lastPurchasedAt.split('T')[0],
      'Co-Benefits': project.coBenefits.join('; '),
      'Origination': originationStage?.detail || 'Unknown',
      Verification: verificationStage?.detail || 'Unknown',
      Issuance: issuanceStage?.detail || 'Unknown',
      Purchase: purchaseStage?.detail || 'Unknown',
      Retirement: retirementStage?.detail || 'Unknown',
    };
  });

  const ws = XLSX.utils.json_to_sheet(data);
  ws['!cols'] = [
    { wch: 30 },
    { wch: 15 },
    { wch: 15 },
    { wch: 15 },
    { wch: 15 },
    { wch: 18 },
    { wch: 15 },
    { wch: 15 },
    { wch: 25 },
    { wch: 20 },
    { wch: 20 },
    { wch: 20 },
    { wch: 20 },
    { wch: 20 },
  ];
  return ws;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sheet: Disclaimer
// ─────────────────────────────────────────────────────────────────────────────

interface DisclaimerRow {
  Text: string;
}

function buildDisclaimerSheet(report: BuyerComplianceReport): XLSX.WorkSheet {
  const data: DisclaimerRow[] = [
    { Text: 'DISCLAIMERS & NOTES' },
    { Text: '' },
    ...report.disclaimers.map((text) => ({ Text: text })),
    { Text: '' },
    { Text: 'EXPORT NOTICE' },
    { Text: REPORT_EXPORT_DISCLAIMER },
    { Text: '' },
    { Text: 'DATA SOURCES' },
    { Text: 'All carbon offset data is aggregated from verified platform sources.' },
    { Text: 'Co-benefits are derived from project metadata and verified claims.' },
    { Text: 'Supply chain stages reflect the documented lifecycle of each offset.' },
  ];

  const ws = XLSX.utils.json_to_sheet(data);
  ws['!cols'] = [{ wch: 80 }];
  ws.A1.s = { bold: true };
  return ws;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generates an Excel workbook from a buyer compliance report.
 * Returns the workbook as binary data (Uint8Array).
 */
export function generateBuyerComplianceReportExcel(
  report: BuyerComplianceReport,
  options: ExcelExportOptions = {}
): Uint8Array {
  const workbook = XLSX.utils.book_new();

  // Add sheets in order
  XLSX.utils.book_append_sheet(workbook, buildSummarySheet(report), 'Summary');
  XLSX.utils.book_append_sheet(workbook, buildCarbonOffsetsSheet(report), 'Carbon Offsets');
  XLSX.utils.book_append_sheet(workbook, buildCoBenefitsSheet(report), 'Co-Benefits');
  XLSX.utils.book_append_sheet(workbook, buildSupplyChainSheet(report), 'Supply Chain');
  XLSX.utils.book_append_sheet(workbook, buildDisclaimerSheet(report), 'Disclaimer');

  // Generate binary
  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
  return new Uint8Array(buffer);
}

/**
 * Generates an Excel filename from the report.
 */
export function getExcelFilename(report: BuyerComplianceReport): string {
  const companySlug = report.companyName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 20);
  const periodSlug = report.period.label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 15);
  return `esg-report-${companySlug}-${periodSlug}.xlsx`;
}
