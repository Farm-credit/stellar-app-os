/**
 * Dynamic PDF generator for Tax-Exempt Impact Receipts (#1819).
 *
 * Uses jsPDF to render print-ready, audited A4 proof of charitable
 * environmental endowments for corporate benefactors on Stellar.
 */

import jsPDF from 'jspdf';
import type { TaxExemptImpactReceipt } from './sponsor-receipts';

// ── Color Palette ────────────────────────────────────────────────────────────
const COLOR_NAVY = '#0D0B21';
const COLOR_EMERALD = '#059669';
const COLOR_LIGHT_GREEN = '#F0FDF4';
const COLOR_BLUE = '#14B6E7';
const COLOR_WHITE = '#FFFFFF';
const COLOR_SLATE_50 = '#F8FAFC';
const COLOR_SLATE_100 = '#F1F5F9';
const COLOR_SLATE_400 = '#94A3B8';
const COLOR_SLATE_600 = '#475569';
const COLOR_SLATE_800 = '#1E293B';
const COLOR_SLATE_900 = '#0F172A';
const COLOR_BORDER = '#E2E8F0';

// ── Page Geometry (A4 mm) ────────────────────────────────────────────────────
const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 16;
const CONTENT_W = PAGE_W - MARGIN * 2;

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

function setFill(doc: jsPDF, hex: string) {
  const [r, g, b] = hexToRgb(hex);
  doc.setFillColor(r, g, b);
}

function setTextCol(doc: jsPDF, hex: string) {
  const [r, g, b] = hexToRgb(hex);
  doc.setTextColor(r, g, b);
}

function setDrawCol(doc: jsPDF, hex: string) {
  const [r, g, b] = hexToRgb(hex);
  doc.setDrawColor(r, g, b);
}

function formatUsd(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatDate(isoDate: string): string {
  try {
    return new Date(isoDate).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return isoDate;
  }
}

/**
 * Draws the top branded banner and legal tax-exempt header.
 */
function drawHeader(doc: jsPDF, receipt: TaxExemptImpactReceipt): number {
  // Top Banner
  setFill(doc, COLOR_NAVY);
  doc.rect(0, 0, PAGE_W, 36, 'F');

  // Emerald accent stripe
  setFill(doc, COLOR_EMERALD);
  doc.rect(0, 36, PAGE_W, 2.5, 'F');

  // Foundation Brand
  setTextCol(doc, COLOR_WHITE);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('FARMCREDIT ECOLOGICAL FOUNDATION', MARGIN, 15);

  setTextCol(doc, COLOR_BLUE);
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.text('Decentralized Environmental Endowment Protocol on Stellar', MARGIN, 22);

  // Status Badge (Top Right)
  setFill(doc, COLOR_EMERALD);
  doc.roundedRect(PAGE_W - MARGIN - 54, 10, 54, 16, 2, 2, 'F');
  setTextCol(doc, COLOR_WHITE);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text('501(c)(3) TAX-EXEMPT RECEIPT', PAGE_W - MARGIN - 27, 17, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text(`AUDITED & SEALED • TAX YR ${receipt.taxYear}`, PAGE_W - MARGIN - 27, 22, { align: 'center' });

  // Receipt Title Bar
  let y = 46;
  setTextCol(doc, COLOR_SLATE_900);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('CHARITABLE IMPACT ENDOWMENT RECEIPT', MARGIN, y);

  // Receipt Number & Date
  setTextCol(doc, COLOR_SLATE_600);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(`Receipt #: ${receipt.receiptNumber}`, PAGE_W - MARGIN, y - 2, { align: 'right' });
  doc.text(`Issued: ${formatDate(receipt.issuedAt)}`, PAGE_W - MARGIN, y + 3, { align: 'right' });

  y += 7;
  setDrawCol(doc, COLOR_BORDER);
  doc.setLineWidth(0.4);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);

  return y + 6;
}

/**
 * Draws Foundation Legal Details and Corporate Benefactor Info side by side.
 */
function drawParties(doc: jsPDF, y: number, receipt: TaxExemptImpactReceipt): number {
  const colW = (CONTENT_W - 6) / 2;
  const cardH = 38;

  // Left: Tax-Exempt Non-Profit Issuer
  setFill(doc, COLOR_SLATE_50);
  setDrawCol(doc, COLOR_BORDER);
  doc.roundedRect(MARGIN, y, colW, cardH, 2, 2, 'FD');

  setTextCol(doc, COLOR_EMERALD);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('QUALIFIED 501(c)(3) ORGANIZATION (ISSUER)', MARGIN + 4, y + 6);

  setTextCol(doc, COLOR_SLATE_900);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(receipt.organization.name, MARGIN + 4, y + 12);

  setTextCol(doc, COLOR_SLATE_600);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text(`EIN / Tax ID: ${receipt.organization.taxId}`, MARGIN + 4, y + 17);
  doc.text(`Status: ${receipt.organization.status}`, MARGIN + 4, y + 22);
  doc.text(`Authority: ${receipt.organization.jurisdiction}`, MARGIN + 4, y + 27);
  doc.text(`Address: ${receipt.organization.address}`, MARGIN + 4, y + 32);

  // Right: Corporate Benefactor Details
  const rightX = MARGIN + colW + 6;
  setFill(doc, COLOR_SLATE_50);
  doc.roundedRect(rightX, y, colW, cardH, 2, 2, 'FD');

  setTextCol(doc, COLOR_BLUE);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('CORPORATE BENEFACTOR (DONOR)', rightX + 4, y + 6);

  setTextCol(doc, COLOR_SLATE_900);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(receipt.benefactor.organizationName, rightX + 4, y + 12);

  setTextCol(doc, COLOR_SLATE_600);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text(`Tax ID / EIN: ${receipt.benefactor.ein ?? 'On File'}`, rightX + 4, y + 17);
  doc.text(`Contact: ${receipt.benefactor.email ?? 'Verified Corporate Portal'}`, rightX + 4, y + 22);

  // Truncated wallet address
  const fullWallet = receipt.benefactor.walletAddress;
  const shortWallet = `${fullWallet.slice(0, 14)}...${fullWallet.slice(-14)}`;
  doc.text(`Stellar Wallet: ${shortWallet}`, rightX + 4, y + 27);
  doc.text(`Tax Reporting Year: ${receipt.taxYear}`, rightX + 4, y + 32);

  return y + cardH + 6;
}

/**
 * Draws the On-Chain Endowment Contribution Box.
 */
function drawEndowmentDetails(doc: jsPDF, y: number, receipt: TaxExemptImpactReceipt): number {
  setFill(doc, COLOR_NAVY);
  doc.roundedRect(MARGIN, y, CONTENT_W, 28, 2, 2, 'F');

  // Left Column inside box: Contribution Amount
  setTextCol(doc, COLOR_SLATE_400);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text('TOTAL TAX-DEDUCTIBLE ENDOWMENT', MARGIN + 6, y + 7);

  setTextCol(doc, COLOR_WHITE);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(formatUsd(receipt.endowment.fiatValueUsd), MARGIN + 6, y + 16);

  setTextCol(doc, COLOR_BLUE);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(
    `Deposited in ${receipt.endowment.tokenAmount.toLocaleString()} ${receipt.endowment.token} • ${receipt.endowment.poolName}`,
    MARGIN + 6,
    y + 22
  );

  // Right Column inside box: Blockchain Verification Reference
  const rightColX = MARGIN + CONTENT_W * 0.52;
  setTextCol(doc, COLOR_SLATE_400);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text('SOROBAN LINEAR STREAM & STELLAR LEDGER', rightColX, y + 7);

  setTextCol(doc, COLOR_WHITE);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text(`Stream ID: #${receipt.endowment.streamId} • Ledger #${receipt.endowment.ledger.toLocaleString()}`, rightColX, y + 13);

  setTextCol(doc, COLOR_BLUE);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  const txHashTruncated = `${receipt.endowment.txHash.slice(0, 24)}...${receipt.endowment.txHash.slice(-12)}`;
  doc.textWithLink(`Tx: ${txHashTruncated}`, rightColX, y + 19, { url: receipt.audit.explorerUrl });

  setTextCol(doc, COLOR_SLATE_400);
  doc.text(`Network: Stellar ${receipt.endowment.network.toUpperCase()} • Instant Settlement`, rightColX, y + 24);

  return y + 33;
}

/**
 * Draws the 4 KPI boxes for Ecological Impact Outcomes.
 */
function drawImpactGrid(doc: jsPDF, y: number, receipt: TaxExemptImpactReceipt): number {
  setTextCol(doc, COLOR_SLATE_900);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text('AUDITED ECOLOGICAL OUTCOMES FUNDED', MARGIN, y);

  y += 4;
  const colCount = 4;
  const spacing = 3;
  const cardW = (CONTENT_W - spacing * (colCount - 1)) / colCount;
  const cardH = 18;

  const metrics = [
    { label: 'CO2 OFFSET FUNDED', val: `${receipt.impact.co2OffsetTonnes.toFixed(1)} tCO2e`, col: COLOR_EMERALD },
    { label: 'TREES RESTORED', val: receipt.impact.treesFunded.toLocaleString(), col: COLOR_BLUE },
    { label: 'WATER TABLE RECHARGE', val: `${receipt.impact.waterRechargeKL.toFixed(1)} kL`, col: COLOR_SLATE_800 },
    { label: 'HABITAT RESTORED', val: `${receipt.impact.biodiversityHectares.toFixed(2)} ha`, col: COLOR_SLATE_800 },
  ];

  metrics.forEach((m, idx) => {
    const cardX = MARGIN + idx * (cardW + spacing);
    setFill(doc, COLOR_SLATE_50);
    setDrawCol(doc, COLOR_BORDER);
    doc.roundedRect(cardX, y, cardW, cardH, 1.5, 1.5, 'FD');

    setTextCol(doc, COLOR_SLATE_600);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.text(m.label, cardX + 3, y + 5);

    setTextCol(doc, m.col);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(m.val, cardX + 3, y + 12);
  });

  return y + cardH + 7;
}

/**
 * Draws the Steward Reward Breakdown Table.
 * Fulfills: ecological impact credits are funded by benefactors to reward both farmers
 * and non-farmer stewards (urban planters, community schools, verifiers).
 */
function drawStewardTable(doc: jsPDF, y: number, receipt: TaxExemptImpactReceipt): number {
  setTextCol(doc, COLOR_SLATE_900);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text('DECENTRALIZED STEWARD REWARD ALLOCATION', MARGIN, y);

  setTextCol(doc, COLOR_SLATE_600);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text('Audited distribution of endowment funds to verified ecological stewards:', MARGIN, y + 4);

  y += 7;

  // Table header
  const rowH = 7;
  setFill(doc, COLOR_SLATE_100);
  doc.rect(MARGIN, y, CONTENT_W, rowH, 'F');

  setTextCol(doc, COLOR_SLATE_800);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);

  const col1X = MARGIN + 3;
  const col2X = MARGIN + 70;
  const col3X = MARGIN + 105;
  const col4X = MARGIN + 130;
  const col5X = MARGIN + 145;

  doc.text('STEWARD CLASS & ROLE', col1X, y + 4.5);
  doc.text('IMPACT DELIVERED', col2X, y + 4.5);
  doc.text('RECIPIENTS', col3X, y + 4.5, { align: 'right' });
  doc.text('SHARE %', col4X, y + 4.5, { align: 'right' });
  doc.text('AMOUNT (USD)', PAGE_W - MARGIN - 3, y + 4.5, { align: 'right' });

  y += rowH;

  const rows = [
    receipt.stewards.farmers,
    receipt.stewards.urbanPlanters,
    receipt.stewards.communitySchools,
    receipt.stewards.verifiers,
  ];

  rows.forEach((row, idx) => {
    const isEven = idx % 2 === 0;
    if (isEven) {
      setFill(doc, COLOR_SLATE_50);
      doc.rect(MARGIN, y, CONTENT_W, 9, 'F');
    }

    setTextCol(doc, COLOR_SLATE_900);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.text(row.title, col1X, y + 4);

    setTextCol(doc, COLOR_SLATE_600);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.text(row.metrics, col2X, y + 4);

    setTextCol(doc, COLOR_SLATE_800);
    doc.setFontSize(7);
    doc.text(row.count.toLocaleString(), col3X, y + 4, { align: 'right' });
    doc.text(`${row.sharePercentage}%`, col4X, y + 4, { align: 'right' });

    setTextCol(doc, COLOR_SLATE_900);
    doc.setFont('helvetica', 'bold');
    doc.text(formatUsd(row.amountUsd), PAGE_W - MARGIN - 3, y + 4, { align: 'right' });

    y += 9;
  });

  // Table summary total row
  setFill(doc, COLOR_LIGHT_GREEN);
  setDrawCol(doc, COLOR_EMERALD);
  doc.rect(MARGIN, y, CONTENT_W, 8, 'F');
  doc.setLineWidth(0.3);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);

  setTextCol(doc, COLOR_EMERALD);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text('TOTAL REWARDS DISTRIBUTED TO STEWARDS', col1X, y + 5);
  doc.text(`${receipt.stewards.totalRecipients.toLocaleString()} Stewards`, col3X, y + 5, { align: 'right' });
  doc.text('100.0%', col4X, y + 5, { align: 'right' });
  doc.text(formatUsd(receipt.endowment.fiatValueUsd), PAGE_W - MARGIN - 3, y + 5, { align: 'right' });

  return y + 13;
}

/**
 * Draws the On-chain Cryptographic Audit & Verification section.
 */
function drawAuditSection(doc: jsPDF, y: number, receipt: TaxExemptImpactReceipt): number {
  setFill(doc, COLOR_SLATE_50);
  setDrawCol(doc, COLOR_BORDER);
  doc.roundedRect(MARGIN, y, CONTENT_W, 26, 2, 2, 'FD');

  // Badge
  setFill(doc, COLOR_EMERALD);
  doc.roundedRect(MARGIN + 4, y + 4, 30, 6, 1, 1, 'F');
  setTextCol(doc, COLOR_WHITE);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6);
  doc.text('CRYPTOGRAPHIC SEAL', MARGIN + 19, y + 8, { align: 'center' });

  setTextCol(doc, COLOR_SLATE_900);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('Audit Protocol Attestation', MARGIN + 37, y + 8);

  setTextCol(doc, COLOR_SLATE_600);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.8);
  doc.text(
    `Audited by ${receipt.audit.auditor} on ${formatDate(receipt.audit.verifiedAt)}.`,
    MARGIN + 4,
    y + 14
  );

  // SHA-256 Digest box
  setTextCol(doc, COLOR_SLATE_800);
  doc.setFont('courier', 'normal');
  doc.setFontSize(6.5);
  doc.text(`SHA-256 DIGEST: ${receipt.audit.cryptographicDigest}`, MARGIN + 4, y + 19);

  // Explorer link
  setTextCol(doc, COLOR_BLUE);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.8);
  doc.textWithLink('Verify on Stellar Ledger Explorer ->', MARGIN + 4, y + 23, { url: receipt.audit.explorerUrl });

  return y + 31;
}

/**
 * Draws Legal Substantiation Notice (IRC § 170) and official footer.
 */
function drawLegalFooter(doc: jsPDF, receipt: TaxExemptImpactReceipt): void {
  const y = PAGE_H - 28;

  // Horizontal divider
  setDrawCol(doc, COLOR_BORDER);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);

  // IRS Section 170 legal notice
  setTextCol(doc, COLOR_SLATE_600);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  const legalLines = doc.splitTextToSize(receipt.legalNotice, CONTENT_W);
  doc.text(legalLines, MARGIN, y + 4);

  // Footer banner
  setFill(doc, COLOR_NAVY);
  doc.rect(0, PAGE_H - 10, PAGE_W, 10, 'F');

  setTextCol(doc, COLOR_WHITE);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.text(
    'FarmCredit Foundation Inc. • Official Tax-Exempt Impact Receipt • Tamper-evident record secured on Stellar',
    PAGE_W / 2,
    PAGE_H - 3.5,
    { align: 'center' }
  );
}

/**
 * Public API: Generates an A4 PDF Tax-Exempt Impact Receipt instance.
 */
export function generateTaxExemptReceiptPdf(receipt: TaxExemptImpactReceipt): jsPDF {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  let y = drawHeader(doc, receipt);
  y = drawParties(doc, y, receipt);
  y = drawEndowmentDetails(doc, y, receipt);
  y = drawImpactGrid(doc, y, receipt);
  y = drawStewardTable(doc, y, receipt);
  drawAuditSection(doc, y, receipt);
  drawLegalFooter(doc, receipt);

  return doc;
}

/**
 * Converts the generated receipt PDF into a Uint8Array buffer (for backend or tests).
 */
export function taxExemptReceiptPdfToBuffer(receipt: TaxExemptImpactReceipt): Uint8Array {
  const doc = generateTaxExemptReceiptPdf(receipt);
  const ab = doc.output('arraybuffer');
  return new Uint8Array(ab);
}

/**
 * Converts the generated receipt PDF into a Blob (for browser downloads).
 */
export function taxExemptReceiptPdfToBlob(receipt: TaxExemptImpactReceipt): Blob {
  const doc = generateTaxExemptReceiptPdf(receipt);
  return doc.output('blob');
}

/**
 * Downloads the receipt PDF directly in the browser.
 */
export function downloadTaxExemptReceiptPdf(receipt: TaxExemptImpactReceipt, filename?: string): void {
  const doc = generateTaxExemptReceiptPdf(receipt);
  const targetName =
    filename ??
    `${receipt.benefactor.brandSlug}-tax-exempt-receipt-${receipt.taxYear}-${receipt.receiptNumber}.pdf`;

  doc.save(targetName);
}
