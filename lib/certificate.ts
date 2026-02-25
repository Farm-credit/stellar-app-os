import jsPDF from 'jspdf';

export interface CertificateData {
  userName: string | null;
  walletAddress: string;
  quantityRetired: number;
  projectName: string;
  projectDescription: string;
  transactionHash: string;
  retirementDate: Date;
  explorerBaseUrl?: string;
}

export interface GenerateCertificateOptions {
  qrDataUrl: string;
  data: CertificateData;
}

const STELLAR_BLUE = '#14B6E7';
const STELLAR_NAVY = '#0D0B21';
const STELLAR_GREEN = '#00B36B';
const WHITE = '#FFFFFF';
const LIGHT_GRAY = '#F1F5F9';
const MID_GRAY = '#64748B';

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 20;
const CONTENT_W = PAGE_W - MARGIN * 2;

function truncate(text: string, maxLength: number): string {
  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function getExplorerUrl(txHash: string, baseUrl?: string): string {
  const base = baseUrl ?? 'https://stellar.expert/explorer/public/tx';
  return `${base}/${txHash}`;
}

export function getDisplayName(data: Pick<CertificateData, 'userName' | 'walletAddress'>): string {
  return data.userName?.trim() || data.walletAddress;
}

export function generateCertificatePdf({ qrDataUrl, data }: GenerateCertificateOptions): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const displayName = getDisplayName(data);
  const explorerUrl = getExplorerUrl(data.transactionHash, data.explorerBaseUrl);
  const projectLabel = truncate(data.projectName, 60);

  // ── Header band ──────────────────────────────────────────────────────────
  doc.setFillColor(STELLAR_NAVY);
  doc.rect(0, 0, PAGE_W, 52, 'F');

  // Stellar blue accent stripe
  doc.setFillColor(STELLAR_BLUE);
  doc.rect(0, 48, PAGE_W, 4, 'F');

  doc.setTextColor(WHITE);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.text('RETIREMENT CERTIFICATE', PAGE_W / 2, 22, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text('Carbon Credit Retirement on the Stellar Network', PAGE_W / 2, 32, {
    align: 'center',
  });

  doc.setFontSize(9);
  doc.text(`Issued: ${formatDate(data.retirementDate)}`, PAGE_W / 2, 42, { align: 'center' });

  // ── Verified badge ────────────────────────────────────────────────────────
  const badgeX = PAGE_W - MARGIN - 32;
  const badgeY = 6;
  doc.setFillColor(STELLAR_GREEN);
  doc.roundedRect(badgeX, badgeY, 32, 10, 2, 2, 'F');
  doc.setTextColor(WHITE);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.text('✓ VERIFIED', badgeX + 16, badgeY + 6.5, { align: 'center' });

  // ── Body ──────────────────────────────────────────────────────────────────
  let y = 64;

  // Intro text
  doc.setTextColor(STELLAR_NAVY);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text('This certifies that', PAGE_W / 2, y, { align: 'center' });

  // Display name
  y += 10;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(STELLAR_BLUE);
  doc.text(truncate(displayName, 55), PAGE_W / 2, y, { align: 'center' });

  y += 8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(STELLAR_NAVY);
  doc.text('has permanently retired', PAGE_W / 2, y, { align: 'center' });

  // Quantity
  y += 12;
  doc.setFillColor(LIGHT_GRAY);
  doc.roundedRect(MARGIN, y - 7, CONTENT_W, 16, 3, 3, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(STELLAR_NAVY);
  doc.text(
    `${data.quantityRetired.toLocaleString()} Carbon Credit${data.quantityRetired !== 1 ? 's' : ''}`,
    PAGE_W / 2,
    y + 4,
    { align: 'center' }
  );

  y += 22;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text('from the project', PAGE_W / 2, y, { align: 'center' });

  // Project name
  y += 9;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(STELLAR_BLUE);
  doc.text(projectLabel, PAGE_W / 2, y, { align: 'center' });

  // Project description
  if (data.projectDescription) {
    y += 8;
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.setTextColor(MID_GRAY);
    const descLines = doc.splitTextToSize(truncate(data.projectDescription, 200), CONTENT_W);
    doc.text(descLines as string[], PAGE_W / 2, y, { align: 'center' });
    y += (descLines as string[]).length * 5;
  }

  // ── Divider ───────────────────────────────────────────────────────────────
  y += 8;
  doc.setDrawColor(STELLAR_BLUE);
  doc.setLineWidth(0.5);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);

  // ── Transaction details + QR ──────────────────────────────────────────────
  y += 10;
  const qrSize = 38;
  const qrX = PAGE_W - MARGIN - qrSize;

  // Left: tx hash block
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(STELLAR_NAVY);
  doc.text('TRANSACTION HASH', MARGIN, y);

  y += 6;
  doc.setFillColor(STELLAR_NAVY);
  doc.roundedRect(MARGIN, y - 4, CONTENT_W - qrSize - 8, 10, 2, 2, 'F');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(WHITE);
  const hashDisplay = truncate(data.transactionHash, 56);
  doc.text(hashDisplay, MARGIN + 3, y + 2.5);

  y += 14;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(STELLAR_BLUE);
  doc.text(truncate(explorerUrl, 70), MARGIN, y);

  // Right: QR code
  const qrY = y - 30;
  try {
    doc.addImage(qrDataUrl, 'PNG', qrX, qrY, qrSize, qrSize);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(MID_GRAY);
    doc.text('Scan to verify', qrX + qrSize / 2, qrY + qrSize + 4, { align: 'center' });
  } catch {
    doc.setFontSize(8);
    doc.setTextColor(MID_GRAY);
    doc.text('[QR unavailable]', qrX + qrSize / 2, qrY + qrSize / 2, { align: 'center' });
  }

  // ── Footer ────────────────────────────────────────────────────────────────
  doc.setFillColor(STELLAR_NAVY);
  doc.rect(0, PAGE_H - 20, PAGE_W, 20, 'F');
  doc.setFillColor(STELLAR_BLUE);
  doc.rect(0, PAGE_H - 20, PAGE_W, 2, 'F');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(WHITE);
  doc.text(
    'Powered by Stellar Network · Immutable · Verifiable · Permanent',
    PAGE_W / 2,
    PAGE_H - 10,
    {
      align: 'center',
    }
  );

  const safeName = displayName.replace(/[^a-z0-9]/gi, '_').slice(0, 30);
  doc.save(`retirement-certificate-${safeName}.pdf`);
}
