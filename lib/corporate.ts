import jsPDF from 'jspdf';

export interface CorporateBranding {
  companyName: string;
  logoUrl?: string;
  primaryColor?: string;
}

export interface EsgReportData {
  companyName: string;
  totalTrees: number;
  totalCo2Offset: number;
  projectsSupported: string[];
  period: string;
  reportId: string;
  offsets?: Array<{
    projectName: string;
    creditType: string;
    tonnesCo2e: number;
    verification: string;
  }>;
  coBenefits?: Array<{
    name: string;
    tonnes: number;
    sharePercentage: number;
  }>;
  supplyChain?: Array<{
    projectName: string;
    location: string;
    tonnesCo2e: number;
    retiredTonnes: number;
    stageSummary: string;
  }>;
}

export function generateEsgReport(data: EsgReportData): void {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();

  // Header
  doc.setFillColor(13, 11, 33); // Stellar Navy
  doc.rect(0, 0, pageWidth, 40, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22);
  doc.text('ESG IMPACT REPORT', pageWidth / 2, 25, { align: 'center' });

  // Content
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(12);
  let y = 55;

  doc.setFont('helvetica', 'bold');
  doc.text('Organization:', 20, y);
  doc.setFont('helvetica', 'normal');
  doc.text(data.companyName, 60, y);

  y += 10;
  doc.setFont('helvetica', 'bold');
  doc.text('Reporting Period:', 20, y);
  doc.setFont('helvetica', 'normal');
  doc.text(data.period, 60, y);

  y += 20;
  doc.setFontSize(16);
  doc.setTextColor(20, 182, 231); // Stellar Blue
  doc.text('Cumulative Impact Metrics', 20, y);

  y += 15;
  doc.setFillColor(241, 245, 249);
  doc.roundedRect(20, y, pageWidth - 40, 30, 3, 3, 'F');

  doc.setTextColor(0, 0, 0);
  doc.setFontSize(12);
  doc.text('Total Trees Planted:', 30, y + 12);
  doc.setFontSize(14);
  doc.text(data.totalTrees.toLocaleString(), 120, y + 12);

  doc.setFontSize(12);
  doc.text('Total CO2 Sequestered:', 30, y + 22);
  doc.setFontSize(14);
  doc.text(`${data.totalCo2Offset.toLocaleString()} tCO2e`, 120, y + 22);

  y += 45;
  doc.setFontSize(16);
  doc.setTextColor(20, 182, 231);
  doc.text('Supported Restoration Projects', 20, y);

  y += 10;
  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139);

  const pageHeight = doc.internal.pageSize.getHeight();
  const bottomMargin = 25;
  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - bottomMargin) {
      doc.addPage();
      y = 25;
      doc.setFontSize(10);
      doc.setTextColor(100, 116, 139);
    }
  };

  if (data.offsets?.length) {
    data.offsets.forEach((line) => {
      ensureSpace(14);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 0, 0);
      doc.text(`• ${line.projectName}`, 25, y);
      doc.text(`${line.tonnesCo2e.toLocaleString()} tCO2e`, pageWidth - 20, y, { align: 'right' });
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139);
      doc.text(`${line.creditType} · ${line.verification}`, 30, y + 5);
      y += 14;
    });
  } else {
    data.projectsSupported.forEach((project) => {
      ensureSpace(7);
      doc.text(`• ${project}`, 25, y);
      y += 7;
    });
  }

  if (data.coBenefits?.length) {
    y += 8;
    ensureSpace(20);
    doc.setFontSize(16);
    doc.setTextColor(20, 182, 231);
    doc.setFont('helvetica', 'bold');
    doc.text('Co-Benefits Achieved', 20, y);
    y += 10;
    doc.setFontSize(10);
    data.coBenefits.forEach((benefit) => {
      ensureSpace(7);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139);
      doc.text(`• ${benefit.name}`, 25, y);
      doc.text(
        `${benefit.tonnes.toLocaleString()} tCO2e · ${benefit.sharePercentage}% of portfolio`,
        pageWidth - 20,
        y,
        { align: 'right' }
      );
      y += 7;
    });
  }

  if (data.supplyChain?.length) {
    y += 8;
    ensureSpace(20);
    doc.setFontSize(16);
    doc.setTextColor(20, 182, 231);
    doc.setFont('helvetica', 'bold');
    doc.text('Supply Chain Impact', 20, y);
    y += 10;
    doc.setFontSize(10);
    data.supplyChain.forEach((project) => {
      ensureSpace(12);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 0, 0);
      doc.text(`• ${project.projectName}`, 25, y);
      doc.text(`${project.tonnesCo2e.toLocaleString()} tCO2e`, pageWidth - 20, y, {
        align: 'right',
      });
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139);
      doc.text(
        `${project.location} · ${project.stageSummary} · ${project.retiredTonnes.toLocaleString()} tCO2e retired`,
        30,
        y + 5
      );
      y += 12;
    });
  }

  // Footer (on every page)
  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(`Report ID: ${data.reportId} | Page ${page} of ${pageCount}`, pageWidth / 2, 285, {
      align: 'center',
    });
  }

  doc.save(`esg-report-${data.companyName.replace(/\s+/g, '-').toLowerCase()}.pdf`);
}

const escapeXml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

function xmlCell(value: string | number, bold = false): string {
  const data =
    typeof value === 'number'
      ? `<Data ss:Type="Number">${value}</Data>`
      : `<Data ss:Type="String">${escapeXml(value)}</Data>`;
  const style = bold ? ' ss:StyleID="sBold"' : '';
  return `<Cell${style}>${data}</Cell>`;
}

function xmlRow(values: Array<string | number>, bold = false): string {
  return `<Row>${values.map((value) => xmlCell(value, bold)).join('')}</Row>`;
}

function xmlWorksheet(name: string, rows: string[]): string {
  return `<Worksheet ss:Name="${escapeXml(name)}"><Table>${rows.join('')}</Table></Worksheet>`;
}

/**
 * Builds an Excel 2003 SpreadsheetML workbook (one worksheet per report
 * section) as a string. Uses no third-party dependency so the Excel export
 * stays a light, offline, deterministic build step (#1345).
 */
export function buildEsgSpreadsheet(data: EsgReportData): string {
  const summaryRows = [
    xmlRow(['ESG Impact Report'], true),
    xmlRow(['Organization', data.companyName]),
    xmlRow(['Reporting Period', data.period]),
    xmlRow(['Report ID', data.reportId]),
    xmlRow(['Total Trees Planted', data.totalTrees]),
    xmlRow(['Total CO2 Sequestered (tCO2e)', data.totalCo2Offset]),
  ];

  const offsetRows = [
    xmlRow(['Project', 'Credit Type', 'Tonnes (tCO2e)', 'Verification'], true),
    ...(data.offsets ?? []).map((line) =>
      xmlRow([line.projectName, line.creditType, line.tonnesCo2e, line.verification])
    ),
  ];

  const coBenefitRows = [
    xmlRow(['Co-Benefit', 'Tonnes (tCO2e)', 'Share of Portfolio (%)'], true),
    ...(data.coBenefits ?? []).map((benefit) =>
      xmlRow([benefit.name, benefit.tonnes, benefit.sharePercentage])
    ),
  ];

  const supplyChainRows = [
    xmlRow(['Project', 'Location', 'Tonnes (tCO2e)', 'Retired (tCO2e)', 'Chain of Custody'], true),
    ...(data.supplyChain ?? []).map((project) =>
      xmlRow([
        project.projectName,
        project.location,
        project.tonnesCo2e,
        project.retiredTonnes,
        project.stageSummary,
      ])
    ),
  ];

  return [
    '<?xml version="1.0"?>',
    '<?mso-application progid="Excel.Sheet"?>',
    '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"',
    ' xmlns:o="urn:schemas-microsoft-com:office:office"',
    ' xmlns:x="urn:schemas-microsoft-com:office:excel"',
    ' xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">',
    '<Styles><Style ss:ID="sBold"><Font ss:Bold="1"/></Style></Styles>',
    xmlWorksheet('Summary', summaryRows),
    xmlWorksheet('Offsets', offsetRows),
    xmlWorksheet('Co-Benefits', coBenefitRows),
    xmlWorksheet('Supply Chain', supplyChainRows),
    '</Workbook>',
  ].join('');
}

/** Downloads the ESG report as an Excel-openable .xls workbook (#1345). */
export function generateEsgExcel(data: EsgReportData): void {
  const workbook = buildEsgSpreadsheet(data);
  const blob = new Blob([workbook], { type: 'application/vnd.ms-excel;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `esg-report-${data.companyName.replace(/\s+/g, '-').toLowerCase()}.xls`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
