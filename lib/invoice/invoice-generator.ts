/**
 * Branded PDF invoice generator for B2B corporate sponsors (#1138).
 *
 * Uses jsPDF (already a project dependency) to produce A4 invoices with:
 * - Harvesta branding (colours, logo text)
 * - Itemised line items (species, region, quantity, unit price)
 * - Tax calculation (configurable VAT / GST lines)
 * - Payment terms and due-date calculation
 * - Stellar transaction hash references for transparency
 */

import jsPDF from 'jspdf';
import type {
  InvoiceGenerateRequest,
  InvoiceGenerateResponse,
  InvoiceLineItem,
  InvoiceTaxLine,
  PaymentTerms,
} from '@/lib/types/invoice';

// ── Brand colours ────────────────────────────────────────────────────────────
const BRAND_NAVY = '#0D0B21';
const BRAND_BLUE = '#14B6E7';
const BRAND_GREEN = '#00B36B';
const WHITE = '#FFFFFF';
const LIGHT_GRAY = '#F8FAFC';
const MID_GRAY = '#64748B';
const DARK_GRAY = '#1E293B';
const BORDER_GRAY = '#E2E8F0';

// ── Page geometry (A4 mm) ────────────────────────────────────────────────────
const PAGE_W = 210;
const MARGIN = 18;
const CONTENT_W = PAGE_W - MARGIN * 2;
const COL_WIDTHS = {
  description: CONTENT_W * 0.42,
  qty: CONTENT_W * 0.1,
  unitPrice: CONTENT_W * 0.2,
  subtotal: CONTENT_W * 0.18,
} as const;

// ── Helpers ──────────────────────────────────────────────────────────────────

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

function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

function formatDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function getDueDateFromTerms(issueDate: string, terms: PaymentTerms): string {
  const date = new Date(issueDate);
  const days: Record<PaymentTerms, number> = {
    'net-7': 7,
    'net-14': 14,
    'net-30': 30,
    'net-60': 60,
    'due-on-receipt': 0,
  };
  date.setDate(date.getDate() + days[terms]);
  return date.toISOString();
}

function getTermsLabel(terms: PaymentTerms): string {
  const labels: Record<PaymentTerms, string> = {
    'net-7': 'Net 7 Days',
    'net-14': 'Net 14 Days',
    'net-30': 'Net 30 Days',
    'net-60': 'Net 60 Days',
    'due-on-receipt': 'Due on Receipt',
  };
  return labels[terms];
}

function computeTotals(
  lineItems: InvoiceLineItem[],
  taxLines: InvoiceTaxLine[] | undefined
): { subtotal: number; taxTotal: number; grandTotal: number } {
  const subtotal = lineItems.reduce((acc, item) => acc + item.subtotal, 0);
  const taxTotal = (taxLines ?? []).reduce((acc, t) => acc + t.amount, 0);
  return { subtotal, taxTotal, grandTotal: subtotal + taxTotal };
}

// ── PDF builder ──────────────────────────────────────────────────────────────

function drawHeader(doc: jsPDF, invoiceNumber: string, issueDate: string): number {
  // Navy header bar
  setFill(doc, BRAND_NAVY);
  doc.rect(0, 0, PAGE_W, 48, 'F');

  // Accent stripe
  setFill(doc, BRAND_BLUE);
  doc.rect(0, 44, PAGE_W, 4, 'F');

  // Logo / company name
  setTextCol(doc, WHITE);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text('🌱 Harvesta', MARGIN, 18);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('Environmental Impact Platform on Stellar', MARGIN, 26);

  // "INVOICE" label + number — right-aligned
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.text('INVOICE', PAGE_W - MARGIN, 18, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(invoiceNumber, PAGE_W - MARGIN, 26, { align: 'right' });
  doc.text(`Date: ${formatDate(issueDate)}`, PAGE_W - MARGIN, 33, { align: 'right' });

  return 58; // y position after header
}

function drawParties(
  doc: jsPDF,
  y: number,
  req: InvoiceGenerateRequest
): number {
  const { sponsor } = req;
  const dueDate = getDueDateFromTerms(req.issueDate, req.paymentTerms);

  // Issuer block (left)
  setTextCol(doc, DARK_GRAY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('FROM', MARGIN, y);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  setTextCol(doc, BRAND_NAVY);
  doc.text('Harvesta / Farm Credit', MARGIN, y + 6);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  setTextCol(doc, MID_GRAY);
  doc.text('hello@harvesta.io', MARGIN, y + 12);
  doc.text('www.harvesta.io', MARGIN, y + 18);
  doc.text('Registered in Nigeria', MARGIN, y + 24);

  // Bill-to block (right half)
  const billX = PAGE_W / 2 + 4;
  setTextCol(doc, DARK_GRAY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('BILL TO', billX, y);

  setTextCol(doc, BRAND_NAVY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(sponsor.companyName, billX, y + 6);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  setTextCol(doc, MID_GRAY);
  if (sponsor.contactName) doc.text(sponsor.contactName, billX, y + 12);
  doc.text(sponsor.email, billX, y + (sponsor.contactName ? 18 : 12));
  if (sponsor.address) {
    const addr = doc.splitTextToSize(sponsor.address, CONTENT_W / 2 - 10);
    doc.text(addr, billX, y + (sponsor.contactName ? 24 : 18));
  }
  if (sponsor.taxId) {
    doc.text(`Tax ID: ${sponsor.taxId}`, billX, y + (sponsor.contactName ? 30 : 24));
  }

  // Payment terms pill
  const pillY = y + 32;
  setFill(doc, LIGHT_GRAY);
  setDrawCol(doc, BORDER_GRAY);
  doc.roundedRect(MARGIN, pillY, 80, 12, 2, 2, 'FD');
  setTextCol(doc, DARK_GRAY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text(`Terms: ${getTermsLabel(req.paymentTerms)}`, MARGIN + 4, pillY + 7.5);

  setFill(doc, LIGHT_GRAY);
  doc.roundedRect(MARGIN + 84, pillY, 80, 12, 2, 2, 'FD');
  doc.text(`Due: ${formatDate(dueDate)}`, MARGIN + 88, pillY + 7.5);

  return y + 52;
}

function drawLineItemsTable(
  doc: jsPDF,
  y: number,
  items: InvoiceLineItem[],
  currency: string
): number {
  // Table header
  setFill(doc, BRAND_NAVY);
  doc.rect(MARGIN, y, CONTENT_W, 9, 'F');
  setTextCol(doc, WHITE);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);

  const cols = [
    { label: 'DESCRIPTION', x: MARGIN + 3, w: COL_WIDTHS.description },
    { label: 'QTY', x: MARGIN + COL_WIDTHS.description + 3, w: COL_WIDTHS.qty, align: 'right' as const },
    { label: 'UNIT PRICE', x: MARGIN + COL_WIDTHS.description + COL_WIDTHS.qty + 3, w: COL_WIDTHS.unitPrice, align: 'right' as const },
    { label: 'SUBTOTAL', x: MARGIN + CONTENT_W - 3, w: COL_WIDTHS.subtotal, align: 'right' as const },
  ];

  for (const col of cols) {
    doc.text(col.label, col.align === 'right' ? col.x + col.w - 6 : col.x, y + 6, {
      align: col.align ?? 'left',
    });
  }

  y += 10;

  // Row data
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const rowH = item.species || item.region ? 14 : 9;
    const bg = i % 2 === 0 ? WHITE : LIGHT_GRAY;

    setFill(doc, bg);
    doc.rect(MARGIN, y, CONTENT_W, rowH, 'F');

    setTextCol(doc, DARK_GRAY);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);

    // Description (possibly 2 lines)
    doc.text(item.description, MARGIN + 3, y + 6);
    if (item.species || item.region) {
      setTextCol(doc, MID_GRAY);
      doc.setFontSize(7.5);
      const sub = [item.species, item.region].filter(Boolean).join(' · ');
      doc.text(sub, MARGIN + 3, y + 11);
      setTextCol(doc, DARK_GRAY);
      doc.setFontSize(8.5);
    }

    const qtyX = MARGIN + COL_WIDTHS.description + COL_WIDTHS.qty - 3;
    doc.text(String(item.quantity), qtyX, y + 6, { align: 'right' });

    const upX = MARGIN + COL_WIDTHS.description + COL_WIDTHS.qty + COL_WIDTHS.unitPrice - 3;
    doc.text(formatCurrency(item.unitPrice, currency), upX, y + 6, { align: 'right' });

    doc.text(formatCurrency(item.subtotal, currency), MARGIN + CONTENT_W - 3, y + 6, {
      align: 'right',
    });

    y += rowH;
  }

  // Bottom border of table
  setDrawCol(doc, BORDER_GRAY);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, y, MARGIN + CONTENT_W, y);

  return y + 4;
}

function drawTotals(
  doc: jsPDF,
  y: number,
  subtotal: number,
  taxLines: InvoiceTaxLine[] | undefined,
  grandTotal: number,
  currency: string
): number {
  const labelX = MARGIN + CONTENT_W - 60;
  const amountX = MARGIN + CONTENT_W;

  const row = (label: string, amount: number, bold = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(9);
    setTextCol(doc, bold ? BRAND_NAVY : MID_GRAY);
    doc.text(label, labelX, y);
    doc.text(formatCurrency(amount, currency), amountX, y, { align: 'right' });
    y += 7;
  };

  row('Subtotal', subtotal);

  for (const tax of taxLines ?? []) {
    row(`${tax.label}`, tax.amount);
  }

  // Grand total bar
  setFill(doc, BRAND_GREEN);
  doc.rect(MARGIN + CONTENT_W - 70, y - 2, 70, 11, 'F');
  setTextCol(doc, WHITE);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('TOTAL DUE', labelX, y + 6);
  doc.text(formatCurrency(grandTotal, currency), amountX, y + 6, { align: 'right' });

  return y + 18;
}

function drawStellarRefs(doc: jsPDF, y: number, hashes: string[]): number {
  if (!hashes.length) return y;

  setTextCol(doc, MID_GRAY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('STELLAR BLOCKCHAIN REFERENCES', MARGIN, y);
  y += 5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  for (const hash of hashes) {
    const url = `https://stellar.expert/explorer/public/tx/${hash}`;
    doc.setTextColor(20, 182, 231); // BRAND_BLUE
    doc.textWithLink(hash, MARGIN, y, { url });
    y += 5;
  }

  return y + 4;
}

function drawNotes(doc: jsPDF, y: number, notes: string): number {
  setTextCol(doc, MID_GRAY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('NOTES', MARGIN, y);
  y += 5;
  doc.setFont('helvetica', 'normal');
  const lines = doc.splitTextToSize(notes, CONTENT_W);
  doc.text(lines, MARGIN, y);
  return y + lines.length * 5 + 4;
}

function drawFooter(doc: jsPDF) {
  const pageH = doc.internal.pageSize.getHeight();
  setFill(doc, BRAND_NAVY);
  doc.rect(0, pageH - 14, PAGE_W, 14, 'F');
  setTextCol(doc, WHITE);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text(
    'Harvesta | hello@harvesta.io | www.harvesta.io | Transparent tree planting on Stellar',
    PAGE_W / 2,
    pageH - 5,
    { align: 'center' }
  );
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Generates a branded A4 PDF invoice for a B2B corporate sponsor.
 * Returns the PDF as a Uint8Array buffer (or base64 string when requested).
 */
export function generateSponsorInvoicePdf(req: InvoiceGenerateRequest): InvoiceGenerateResponse {
  const dueDate = getDueDateFromTerms(req.issueDate, req.paymentTerms);
  const { subtotal, taxTotal, grandTotal } = computeTotals(req.lineItems, req.taxLines);

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  let y = drawHeader(doc, req.invoiceNumber, req.issueDate);
  y = drawParties(doc, y, req);
  y += 4;
  y = drawLineItemsTable(doc, y, req.lineItems, req.currency);
  y = drawTotals(doc, y, subtotal, req.taxLines, grandTotal, req.currency);
  y += 6;

  if (req.stellarTxHashes?.length) {
    y = drawStellarRefs(doc, y, req.stellarTxHashes);
  }

  if (req.notes) {
    drawNotes(doc, y, req.notes);
  }

  drawFooter(doc);

  const base: Omit<InvoiceGenerateResponse, 'base64Pdf' | 'pdfBytes'> = {
    invoiceNumber: req.invoiceNumber,
    subtotal,
    taxTotal,
    grandTotal,
    currency: req.currency,
    issuedAt: new Date(req.issueDate).toISOString(),
    dueDate: new Date(dueDate).toISOString(),
  };

  if (req.returnBase64) {
    return { ...base, base64Pdf: doc.output('datauristring') };
  }

  const arrayBuffer = doc.output('arraybuffer');
  return { ...base, pdfBytes: new Uint8Array(arrayBuffer) };
}
