/**
 * PDF export for buyer ESG compliance reports — Issue #1407
 *
 * Generates a branded PDF document with:
 * - Header with company name, report ID, period
 * - Three main sections: carbon offsets, co-benefits, supply chain
 * - Key metrics and data tables
 * - Disclaimer footer
 *
 * Extends existing jsPDF patterns from lib/corporate.ts and lib/gift/giftCertificatePdf.ts
 */

import jsPDF from 'jspdf';
import type { BuyerComplianceReport } from '@/lib/esg-reporting-v2';
import { REPORT_EXPORT_DISCLAIMER } from '@/lib/esg-reporting-v2';

interface PDFExportOptions {
  filename?: string;
}

const BRAND_NAVY = '#0D0B21';
const STELLAR_BLUE = '#14B6E7';
const MID_GRAY = '#64748B';
const LIGHT_GRAY = '#F1F5F9';

function hexToRgb(hex: string): [number, number, number] {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)]
    : [0, 0, 0];
}

function setFill(doc: jsPDF, hex: string) {
  const [r, g, b] = hexToRgb(hex);
  doc.setFillColor(r, g, b);
}

function setTextCol(doc: jsPDF, hex: string) {
  const [r, g, b] = hexToRgb(hex);
  doc.setTextColor(r, g, b);
}

// ─────────────────────────────────────────────────────────────────────────────
// Header
// ─────────────────────────────────────────────────────────────────────────────

function drawHeader(doc: jsPDF, report: BuyerComplianceReport): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  const headerHeight = 50;

  // Navy background
  setFill(doc, BRAND_NAVY);
  doc.rect(0, 0, pageWidth, headerHeight, 'F');

  // White title
  setTextCol(doc, '#FFFFFF');
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('ESG COMPLIANCE REPORT', pageWidth / 2, 20, { align: 'center' });

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(report.companyName, pageWidth / 2, 30, { align: 'center' });
  doc.text(report.period.label, pageWidth / 2, 37, { align: 'center' });

  setTextCol(doc, '#000000');
  return headerHeight + 10;
}

// ─────────────────────────────────────────────────────────────────────────────
// Metadata Bar
// ─────────────────────────────────────────────────────────────────────────────

function drawMetadataBar(doc: jsPDF, report: BuyerComplianceReport, y: number): number {
  const pageWidth = doc.internal.pageSize.getWidth();

  setFill(doc, LIGHT_GRAY);
  doc.rect(20, y, pageWidth - 40, 25, 'F');

  setTextCol(doc, MID_GRAY);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');

  const reportDate = new Date(report.generatedAt);
  const dateStr = reportDate.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  doc.text(`Report ID: ${report.reportId}`, 25, y + 7);
  doc.text(`Generated: ${dateStr}`, 25, y + 14);
  doc.text(`Period: ${report.period.start} to ${report.period.end}`, 25, y + 21);

  return y + 30;
}

// ─────────────────────────────────────────────────────────────────────────────
// Carbon Offsets Section
// ─────────────────────────────────────────────────────────────────────────────

function drawCarbonOffsetsSection(doc: jsPDF, report: BuyerComplianceReport, startY: number): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const bottomMargin = 30;
  const margin = 20;
  let y = startY;

  // Title
  setTextCol(doc, STELLAR_BLUE);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Carbon Offset Purchases', margin, y);
  y += 10;

  // Key metrics box
  setFill(doc, LIGHT_GRAY);
  doc.rect(margin, y, pageWidth - 2 * margin, 28, 'F');

  setTextCol(doc, '#000000');
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Total CO₂e:', margin + 5, y + 8);
  doc.setFont('helvetica', 'normal');
  doc.text(`${report.carbonOffsets.totalTonnes.toLocaleString()} tonnes`, margin + 40, y + 8);

  doc.setFont('helvetica', 'bold');
  doc.text('Active / Retired:', margin + 5, y + 15);
  doc.setFont('helvetica', 'normal');
  doc.text(
    `${report.carbonOffsets.activeTonnes.toLocaleString()} / ${report.carbonOffsets.retiredTonnes.toLocaleString()} tonnes`,
    margin + 40,
    y + 15
  );

  doc.setFont('helvetica', 'bold');
  doc.text('Total Cost:', margin + 5, y + 22);
  doc.setFont('helvetica', 'normal');
  doc.text(
    `$${report.carbonOffsets.totalCostUsd.toLocaleString()} USD`,
    margin + 40,
    y + 22
  );

  y += 35;

  // Line items table header
  setTextCol(doc, '#FFFFFF');
  setFill(doc, BRAND_NAVY);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.rect(margin, y, pageWidth - 2 * margin, 6, 'F');
  doc.text('Project', margin + 3, y + 4.5);
  doc.text('Tonnes', pageWidth - margin - 80, y + 4.5);
  doc.text('Cost/Ton', pageWidth - margin - 50, y + 4.5);
  doc.text('Status', pageWidth - margin - 15, y + 4.5);
  y += 8;

  // Line items
  setTextCol(doc, '#000000');
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');

  for (const item of report.carbonOffsets.lineItems.slice(0, 10)) {
    if (y + 5 > pageHeight - bottomMargin) {
      doc.addPage();
      y = 20;
    }

    doc.text(item.projectName.substring(0, 25), margin + 3, y);
    doc.text(item.tonnes.toLocaleString(), pageWidth - margin - 80, y);
    doc.text(`$${item.costPerTonUsd}`, pageWidth - margin - 50, y);
    doc.text(item.status, pageWidth - margin - 15, y);
    y += 5;
  }

  if (report.carbonOffsets.lineItems.length > 10) {
    doc.setFont('helvetica', 'italic');
    setTextCol(doc, MID_GRAY);
    doc.text(
      `... and ${report.carbonOffsets.lineItems.length - 10} more projects`,
      margin + 3,
      y
    );
    y += 5;
  }

  return y + 8;
}

// ─────────────────────────────────────────────────────────────────────────────
// Co-Benefits Section
// ─────────────────────────────────────────────────────────────────────────────

function drawCoBenefitsSection(doc: jsPDF, report: BuyerComplianceReport, startY: number): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const bottomMargin = 30;
  const margin = 20;
  let y = startY;

  // Title
  setTextCol(doc, STELLAR_BLUE);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Co-Benefits Achieved', margin, y);
  y += 10;

  // Summary box
  setFill(doc, LIGHT_GRAY);
  doc.rect(margin, y, pageWidth - 2 * margin, 15, 'F');

  setTextCol(doc, '#000000');
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(
    `${report.coBenefits.allBenefits.length} unique benefits across ${report.coBenefits.totalBenefitInstances} project instances`,
    margin + 5,
    y + 10
  );
  y += 20;

  // Top benefits table header
  setTextCol(doc, '#FFFFFF');
  setFill(doc, BRAND_NAVY);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.rect(margin, y, pageWidth - 2 * margin, 6, 'F');
  doc.text('Benefit', margin + 3, y + 4.5);
  doc.text('Projects', pageWidth - margin - 80, y + 4.5);
  doc.text('Tonnes', pageWidth - margin - 40, y + 4.5);
  doc.text('Share', pageWidth - margin - 15, y + 4.5);
  y += 8;

  // Top benefits rows
  setTextCol(doc, '#000000');
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');

  for (const benefit of report.coBenefits.topBenefits) {
    if (y + 5 > pageHeight - bottomMargin) {
      doc.addPage();
      y = 20;
    }

    doc.text(benefit.name, margin + 3, y);
    doc.text(benefit.projectCount.toString(), pageWidth - margin - 80, y);
    doc.text(benefit.tonnes.toLocaleString(), pageWidth - margin - 40, y);
    doc.text(`${benefit.sharePercentage}%`, pageWidth - margin - 15, y);
    y += 5;
  }

  return y + 8;
}

// ─────────────────────────────────────────────────────────────────────────────
// Supply Chain Section
// ─────────────────────────────────────────────────────────────────────────────

function drawSupplyChainSection(doc: jsPDF, report: BuyerComplianceReport, startY: number): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const bottomMargin = 40;
  const margin = 20;
  let y = startY;

  // Title
  setTextCol(doc, STELLAR_BLUE);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Supply Chain Impact', margin, y);
  y += 10;

  // Key metrics box
  setFill(doc, LIGHT_GRAY);
  doc.rect(margin, y, pageWidth - 2 * margin, 28, 'F');

  setTextCol(doc, '#000000');
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Projects Supported:', margin + 5, y + 8);
  doc.setFont('helvetica', 'normal');
  doc.text(report.supplyChain.projectCount.toString(), margin + 60, y + 8);

  doc.setFont('helvetica', 'bold');
  doc.text('Retirement Rate:', margin + 5, y + 15);
  doc.setFont('helvetica', 'normal');
  doc.text(`${report.supplyChain.retirementRate}%`, margin + 60, y + 15);

  doc.setFont('helvetica', 'bold');
  doc.text('Avg Days to Retirement:', margin + 5, y + 22);
  doc.setFont('helvetica', 'normal');
  doc.text(
    report.supplyChain.avgDaysToRetirement !== null
      ? `${report.supplyChain.avgDaysToRetirement} days`
      : 'N/A',
    margin + 60,
    y + 22
  );

  y += 35;

  // Stage completion summary
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  setTextCol(doc, '#000000');
  doc.text('Supply Chain Stage Completion:', margin, y);
  y += 6;

  const stages = [
    { label: 'Origination', value: report.supplyChain.stageCompletionSummary.origination },
    { label: 'Verification', value: report.supplyChain.stageCompletionSummary.verification },
    { label: 'Issuance', value: report.supplyChain.stageCompletionSummary.issuance },
    { label: 'Purchase', value: report.supplyChain.stageCompletionSummary.purchase },
    { label: 'Retirement', value: report.supplyChain.stageCompletionSummary.retirement },
  ];

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  for (const stage of stages) {
    if (y + 4 > pageHeight - bottomMargin) {
      doc.addPage();
      y = 20;
    }
    doc.text(`${stage.label}: ${stage.value}%`, margin + 3, y);
    y += 5;
  }

  return y + 8;
}

// ─────────────────────────────────────────────────────────────────────────────
// Footer & Disclaimer
// ─────────────────────────────────────────────────────────────────────────────

function drawFooter(doc: jsPDF) {
  const pageHeight = doc.internal.pageSize.getHeight();
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;

  setTextCol(doc, MID_GRAY);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');

  const disclaimerText = REPORT_EXPORT_DISCLAIMER;
  const disclaimerLines = doc.splitTextToSize(disclaimerText, pageWidth - 2 * margin);

  let disclaimerY = pageHeight - 25 - disclaimerLines.length * 3;
  doc.text(disclaimerLines, margin, disclaimerY);

  // Bottom border
  setFill(doc, BRAND_NAVY);
  doc.rect(0, pageHeight - 8, pageWidth, 8, 'F');

  setTextCol(doc, '#FFFFFF');
  doc.setFontSize(7);
  doc.text(
    `Generated on ${new Date().toLocaleDateString('en-US')} | Harvesta ESG Compliance System`,
    pageWidth / 2,
    pageHeight - 3,
    { align: 'center' }
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generates a branded PDF document from a buyer compliance report.
 * Returns the PDF as binary data (Uint8Array).
 */
export function generateBuyerComplianceReportPdf(
  report: BuyerComplianceReport,
  _options: PDFExportOptions = {}
): Uint8Array {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  let y = drawHeader(doc, report);
  y = drawMetadataBar(doc, report, y);
  y = drawCarbonOffsetsSection(doc, report, y);
  y = drawCoBenefitsSection(doc, report, y);
  y = drawSupplyChainSection(doc, report, y);

  // Add footer on last page
  drawFooter(doc);

  const arrayBuffer = doc.output('arraybuffer');
  return new Uint8Array(arrayBuffer);
}

/**
 * Generates a PDF filename from the report.
 */
export function getPdfFilename(report: BuyerComplianceReport): string {
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
  return `esg-report-${companySlug}-${periodSlug}.pdf`;
}
