/**
 * Co-branded bulk corporate PDF certificate generator.
 *
 * Renders a multi-page landscape A4 PDF with jsPDF — one personalized
 * co-branded certificate per employee recipient for easy corporate distribution.
 */

import jsPDF from 'jspdf';
import {
  CO2_KG_PER_TREE_PER_YEAR,
  type CorporateOrder,
  type EmployeeCertificateRecipient,
} from './packages';

const PAGE_W = 297;
const PAGE_H = 210;
const CENTER_X = PAGE_W / 2;

type Rgb = [number, number, number];

export function hexToRgb(hex: string): Rgb {
  const clean = hex.replace('#', '').trim();
  const full = clean.length === 3 ? clean.replace(/./g, (c) => c + c) : clean;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) {
    return [22, 101, 52]; // fallback forest green
  }
  const value = Number.parseInt(full, 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function formatIssuedDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function drawEmblem(doc: jsPDF, x: number, y: number, primary: Rgb, secondary: Rgb): void {
  doc.setFillColor(...secondary);
  doc.circle(x, y, 10, 'F');
  doc.setFillColor(...primary);
  doc.triangle(x, y - 7, x - 5, y + 1, x + 5, y + 1, 'F');
  doc.triangle(x, y - 3.5, x - 6, y + 4.5, x + 6, y + 4.5, 'F');
  doc.rect(x - 1, y + 4.5, 2, 2.8, 'F');
}

function drawCertificatePage(
  doc: jsPDF,
  order: CorporateOrder,
  recipient: EmployeeCertificateRecipient,
  index: number,
  total: number
): void {
  const primary = hexToRgb(order.branding.primaryColor);
  const secondary = hexToRgb(order.branding.secondaryColor);
  const bg: Rgb = [250, 252, 250];
  const ink: Rgb = [20, 35, 28];
  const muted: Rgb = [90, 108, 98];

  // Background and double co-branded border
  doc.setFillColor(...bg);
  doc.rect(0, 0, PAGE_W, PAGE_H, 'F');

  doc.setDrawColor(...primary);
  doc.setLineWidth(1.4);
  doc.rect(10, 10, PAGE_W - 20, PAGE_H - 20);

  doc.setDrawColor(...secondary);
  doc.setLineWidth(0.5);
  doc.rect(14, 14, PAGE_W - 28, PAGE_H - 28);

  // Top co-branding banner
  doc.setFillColor(...primary);
  doc.rect(14, 14, PAGE_W - 28, 16, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(`HARVESTA  ×  ${order.branding.companyName.toUpperCase()}`, CENTER_X, 24, {
    align: 'center',
  });

  // Emblem
  drawEmblem(doc, CENTER_X, 46, primary, secondary);

  // Title
  doc.setTextColor(...primary);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(24);
  doc.text('CERTIFICATE OF TREE SPONSORSHIP', CENTER_X, 68, { align: 'center' });

  doc.setTextColor(...muted);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text('PROUDLY PRESENTED TO', CENTER_X, 80, { align: 'center' });

  // Employee recipient name
  doc.setTextColor(...ink);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(26);
  doc.text(recipient.name.trim() || 'Valued Team Member', CENTER_X, 95, { align: 'center' });

  if (recipient.department) {
    doc.setTextColor(...secondary);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(12);
    doc.text(recipient.department, CENTER_X, 104, { align: 'center' });
  }

  // Impact statement
  const treeLabel =
    recipient.treeCount === 1 ? '1 native tree' : `${recipient.treeCount} native trees`;
  const co2Kg = recipient.treeCount * CO2_KG_PER_TREE_PER_YEAR;
  const statement = `In recognition of ${treeLabel} sponsored on your behalf by ${order.branding.companyName}, contributing an estimated ${co2Kg.toLocaleString('en-US')} kg of CO2 offset per year.`;

  doc.setTextColor(...ink);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12);
  const wrapped = doc.splitTextToSize(statement, 215);
  doc.text(wrapped, CENTER_X, 118, { align: 'center' });

  // Tagline
  if (order.branding.tagline) {
    doc.setTextColor(...secondary);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(11);
    doc.text(`"${order.branding.tagline}"`, CENTER_X, 138, { align: 'center' });
  }

  // Assigned tree codes preview
  if (recipient.treeCodes && recipient.treeCodes.length > 0) {
    const previewCodes =
      recipient.treeCodes.length <= 4
        ? recipient.treeCodes.join(', ')
        : `${recipient.treeCodes.slice(0, 4).join(', ')} (+${recipient.treeCodes.length - 4} more)`;
    doc.setTextColor(...muted);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.text(`Sponsored Tree IDs: ${previewCodes}`, CENTER_X, 150, { align: 'center' });
  }

  // Divider line
  doc.setDrawColor(...secondary);
  doc.setLineWidth(0.4);
  doc.line(30, 162, PAGE_W - 30, 162);

  // Footer metadata
  doc.setTextColor(...muted);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text(`Order Ref: ${order.orderNumber}`, 30, 173);
  doc.text(`Issued: ${formatIssuedDate(order.createdAt)}`, CENTER_X, 173, { align: 'center' });
  doc.text(`Certificate ${index + 1} of ${total}`, PAGE_W - 30, 173, { align: 'right' });

  doc.setFontSize(8.5);
  doc.text(
    'Verified on Harvesta Corporate Impact Registry · Co-Branded Employee Edition',
    CENTER_X,
    185,
    { align: 'center' }
  );
}

export function renderBulkCorporateCertificatesPdf(
  order: CorporateOrder,
  recipients: EmployeeCertificateRecipient[]
): jsPDF {
  if (!recipients || recipients.length === 0) {
    throw new Error('At least one employee recipient is required to generate certificates.');
  }

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  doc.setProperties({
    title: `${order.branding.companyName} — Co-Branded Tree Certificates (${order.orderNumber})`,
    subject: `Bulk corporate sponsorship certificates for ${order.quote.quantity} trees`,
    creator: 'Harvesta',
  });

  recipients.forEach((recipient, idx) => {
    if (idx > 0) {
      doc.addPage('a4', 'landscape');
    }
    drawCertificatePage(doc, order, recipient, idx, recipients.length);
  });

  return doc;
}

export function bulkCertificatesPdfToBuffer(
  order: CorporateOrder,
  recipients: EmployeeCertificateRecipient[]
): Uint8Array {
  const doc = renderBulkCorporateCertificatesPdf(order, recipients);
  const arrayBuffer = doc.output('arraybuffer');
  return new Uint8Array(arrayBuffer);
}

export function downloadBulkCertificatesPdf(
  order: CorporateOrder,
  recipients: EmployeeCertificateRecipient[]
): void {
  const doc = renderBulkCorporateCertificatesPdf(order, recipients);
  const slug = order.branding.companyName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  doc.save(`${slug || 'corporate'}-certificates-${order.orderNumber}.pdf`);
}
