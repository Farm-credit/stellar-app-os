/**
 * Gift certificate PDF rendering — Issue #1107
 *
 * Draws a landscape A4 certificate with jsPDF. Works both in the browser
 * (download button) and on the server (email attachment / API download).
 */

import jsPDF from 'jspdf';
import {
  GIFT_THEMES,
  formatTreeCount,
  giftHeadline,
  type GiftCertificate,
} from './giftCertificate';

const PAGE_W = 297;
const PAGE_H = 210;
const CENTER_X = PAGE_W / 2;

type Rgb = [number, number, number];

export function hexToRgb(hex: string): Rgb {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.replace(/./g, (c) => c + c) : clean;
  const value = Number.parseInt(full, 16);
  if (!/^[0-9a-fA-F]{6}$/.test(full) || Number.isNaN(value)) return [0, 0, 0];
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

/** Draws a small stylised tree used as the certificate emblem. */
function drawTreeEmblem(doc: jsPDF, x: number, y: number, primary: Rgb, accent: Rgb): void {
  doc.setFillColor(...accent);
  doc.circle(x, y, 11, 'F');
  doc.setFillColor(...primary);
  doc.triangle(x, y - 7.5, x - 5.5, y + 1, x + 5.5, y + 1, 'F');
  doc.triangle(x, y - 4, x - 6.5, y + 4.5, x + 6.5, y + 4.5, 'F');
  doc.rect(x - 1, y + 4.5, 2, 3, 'F');
}

export function renderGiftCertificatePdf(certificate: GiftCertificate, shareUrl?: string): jsPDF {
  const theme = GIFT_THEMES[certificate.theme];
  const bg = hexToRgb(theme.background);
  const primary = hexToRgb(theme.primary);
  const accent = hexToRgb(theme.accent);
  const text = hexToRgb(theme.text);

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  doc.setProperties({
    title: `Gift Certificate ${certificate.code}`,
    subject: `${formatTreeCount(certificate.treeCount)} sponsored for ${certificate.recipientName}`,
    creator: 'Harvesta',
  });

  // Background and double border.
  doc.setFillColor(...bg);
  doc.rect(0, 0, PAGE_W, PAGE_H, 'F');
  doc.setDrawColor(...primary);
  doc.setLineWidth(1.2);
  doc.rect(10, 10, PAGE_W - 20, PAGE_H - 20);
  doc.setDrawColor(...accent);
  doc.setLineWidth(0.4);
  doc.rect(14, 14, PAGE_W - 28, PAGE_H - 28);

  // Corner flourishes.
  doc.setFillColor(...accent);
  for (const [cx, cy] of [
    [14, 14],
    [PAGE_W - 14, 14],
    [14, PAGE_H - 14],
    [PAGE_W - 14, PAGE_H - 14],
  ] as const) {
    doc.circle(cx, cy, 1.6, 'F');
  }

  drawTreeEmblem(doc, CENTER_X, 34, primary, accent);

  doc.setTextColor(...accent);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('G I F T   C E R T I F I C A T E', CENTER_X, 55, { align: 'center' });

  doc.setTextColor(...primary);
  doc.setFont('times', 'normal');
  doc.setFontSize(28);
  doc.text(giftHeadline(certificate), CENTER_X, 68, { align: 'center' });

  doc.setTextColor(...text);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text('This certifies that', CENTER_X, 82, { align: 'center' });

  doc.setTextColor(...primary);
  doc.setFont('times', 'bolditalic');
  doc.setFontSize(30);
  doc.text(certificate.recipientName, CENTER_X, 96, { align: 'center' });

  doc.setDrawColor(...accent);
  doc.setLineWidth(0.3);
  doc.line(CENTER_X - 60, 100, CENTER_X + 60, 100);

  doc.setTextColor(...text);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12);
  doc.text(
    `has been gifted ${formatTreeCount(certificate.treeCount)} by ${certificate.senderName}`,
    CENTER_X,
    110,
    { align: 'center' }
  );

  let y = 122;
  if (certificate.message) {
    doc.setFont('times', 'italic');
    doc.setFontSize(13);
    const lines = doc.splitTextToSize(`“${certificate.message}”`, 190) as string[];
    doc.text(lines.slice(0, 4), CENTER_X, y, { align: 'center', lineHeightFactor: 1.4 });
    y += Math.min(lines.length, 4) * 6.5 + 4;
  }

  // Impact stats.
  const statsY = Math.max(y + 6, 150);
  const stats: Array<[string, string]> = [
    [certificate.treeCount.toLocaleString('en-US'), certificate.treeCount === 1 ? 'Tree' : 'Trees'],
    [`${certificate.co2KgPerYear.toLocaleString('en-US')} kg`, 'CO₂ absorbed / year'],
    [certificate.species, 'Species'],
  ];
  stats.forEach(([value, label], index) => {
    const x = CENTER_X + (index - 1) * 75;
    doc.setTextColor(...primary);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(value.length > 18 ? 10 : 14);
    doc.text(value, x, statsY, { align: 'center' });
    doc.setTextColor(...text);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text(label.toUpperCase(), x, statsY + 5.5, { align: 'center' });
  });

  // Footer.
  doc.setFontSize(8.5);
  doc.setTextColor(...text);
  doc.text(`Planted in ${certificate.region}`, 24, PAGE_H - 24);
  doc.text(`Issued ${formatIssuedDate(certificate.issuedAt)}`, 24, PAGE_H - 19.5);
  doc.text(`Certificate ${certificate.code}`, PAGE_W - 24, PAGE_H - 24, { align: 'right' });
  if (shareUrl) {
    doc.setTextColor(...primary);
    doc.textWithLink('View online', PAGE_W - 24 - doc.getTextWidth('View online'), PAGE_H - 19.5, {
      url: shareUrl,
    });
  }

  return doc;
}

export function giftCertificatePdfBytes(
  certificate: GiftCertificate,
  shareUrl?: string
): ArrayBuffer {
  return renderGiftCertificatePdf(certificate, shareUrl).output('arraybuffer');
}

export function giftCertificateFileName(certificate: GiftCertificate): string {
  const slug = certificate.recipientName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `gift-certificate-${slug || 'recipient'}-${certificate.code}.pdf`;
}
