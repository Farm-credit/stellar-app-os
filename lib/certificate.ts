import jsPDF from 'jspdf';

export interface CertificateData {
  userName: string | null;
  walletAddress: string;
  quantityRetired: number;
  treeCount: number;
  co2Offset: number;
  plantingDate: Date;
  region: string;
  projectName: string;
  projectDescription: string;
  transactionHash: string;
  retirementDate: Date;
  isAnonymous?: boolean;
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

export function getDisplayName(
  data: Pick<CertificateData, 'userName' | 'walletAddress' | 'isAnonymous'>
): string {
  if (data.isAnonymous) return 'Anonymous Donor';
  return data.userName?.trim() || data.walletAddress;
}

export interface ImpactStats {
  sponsorName: string | null;
  walletAddress: string;
  treesFunded: number;
  co2Absorbed: number;
  speciesCount: number;
  milestones: string[];
  year: number;
  isAnonymous?: boolean;
}

export interface GenerateImpactImageOptions {
  stats: ImpactStats;
  format?: 'svg' | 'png';
  width?: number;
  height?: number;
}

const IMPACT_DEFAULT_W = 1200;
const IMPACT_DEFAULT_H = 630;

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function validateImpactStats(stats: ImpactStats): void {
  if (!stats.walletAddress) {
    throw new CertificateError('Wallet address is required', 'MISSING_WALLET_ADDRESS');
  }
  if (stats.treesFunded < 0) {
    throw new CertificateError('Trees funded must be non-negative', 'INVALID_TREE_COUNT');
  }
  if (stats.co2Absorbed < 0) {
    throw new CertificateError('CO2 absorbed must be non-negative', 'INVALID_CO2_OFFSET');
  }
  if (stats.speciesCount < 0) {
    throw new CertificateError('Species count must be non-negative', 'INVALID_SPECIES_COUNT');
  }
}

function buildImpactSvg(stats: ImpactStats, width: number, height: number): string {
  const displayName = getDisplayName({
    userName: stats.sponsorName,
    walletAddress: stats.walletAddress,
    isAnonymous: stats.isAnonymous,
  });

  const pad = Math.round(width * 0.06);
  const headerH = Math.round(height * 0.22);
  const statCardW = Math.round((width - pad * 2 - 40) / 3);
  const statCardH = Math.round(height * 0.26);
  const statCardY = headerH + Math.round(height * 0.08);
  const statFontSize = Math.round(height * 0.075);
  const labelFontSize = Math.round(height * 0.028);
  const milestoneFontSize = Math.round(height * 0.026);

  const statCards = [
    { value: stats.treesFunded.toLocaleString(), label: 'Trees Funded' },
    { value: `${stats.co2Absorbed.toLocaleString()} t`, label: 'CO2 Absorbed' },
    { value: stats.speciesCount.toLocaleString(), label: 'Species Supported' },
  ];

  const cardsSvg = statCards
    .map((card, i) => {
      const x = pad + i * (statCardW + 20);
      return `
    <g>
      <rect x="${x}" y="${statCardY}" width="${statCardW}" height="${statCardH}" rx="16" fill="${LIGHT_GRAY}" />
      <text x="${x + statCardW / 2}" y="${statCardY + statCardH * 0.55}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-weight="bold" font-size="${statFontSize}" fill="${STELLAR_NAVY}">${escapeXml(card.value)}</text>
      <text x="${x + statCardW / 2}" y="${statCardY + statCardH * 0.82}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="${labelFontSize}" fill="${MID_GRAY}">${escapeXml(card.label)}</text>
    </g>`;
    })
    .join('');

  const milestoneStartY = statCardY + statCardH + Math.round(height * 0.09);
  const visibleMilestones = stats.milestones.slice(0, 3);
  const milestonesSvg = visibleMilestones
    .map((milestone, i) => {
      const y = milestoneStartY + i * (milestoneFontSize + 10);
      return `
    <text x="${pad}" y="${y}" font-family="Helvetica, Arial, sans-serif" font-size="${milestoneFontSize}" fill="${WHITE}">• ${escapeXml(truncate(milestone, 70))}</text>`;
    })
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="${STELLAR_NAVY}" />
  <rect x="0" y="${headerH - 6}" width="${width}" height="6" fill="${STELLAR_BLUE}" />
  <text x="${pad}" y="${Math.round(headerH * 0.42)}" font-family="Helvetica, Arial, sans-serif" font-weight="bold" font-size="${Math.round(height * 0.05)}" fill="${WHITE}">${escapeXml(stats.year)} IMPACT SUMMARY</text>
  <text x="${pad}" y="${Math.round(headerH * 0.72)}" font-family="Helvetica, Arial, sans-serif" font-size="${Math.round(height * 0.035)}" fill="${STELLAR_BLUE}">${escapeXml(truncate(displayName, 50))}</text>
  <g>
    <rect x="${width - pad - 120}" y="${Math.round(headerH * 0.22)}" width="120" height="30" rx="6" fill="${STELLAR_GREEN}" />
    <text x="${width - pad - 60}" y="${Math.round(headerH * 0.22) + 20}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-weight="bold" font-size="14" fill="${WHITE}">✓ VERIFIED</text>
  </g>${cardsSvg}${milestonesSvg}
  <rect x="0" y="${height - 40}" width="${width}" height="40" fill="${STELLAR_NAVY}" />
  <rect x="0" y="${height - 40}" width="${width}" height="3" fill="${STELLAR_BLUE}" />
  <text x="${width / 2}" y="${height - 16}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="14" fill="${WHITE}">Powered by Stellar Network · Immutable · Verifiable · Permanent</text>
</svg>`;
}

function svgToPngDataUrl(svg: string, width: number, height: number): Promise<string> {
  return new Promise((resolve, reject) => {
    if (typeof document === 'undefined' || typeof Image === 'undefined') {
      reject(new CertificateError('Canvas rendering is unavailable', 'IMAGE_RENDERING_UNAVAILABLE'));
      return;
    }
    const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          throw new CertificateError('Canvas context unavailable', 'IMAGE_RENDERING_UNAVAILABLE');
        }
        ctx.drawImage(img, 0, 0, width, height);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL('image/png'));
      } catch (error) {
        URL.revokeObjectURL(url);
        reject(error);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new CertificateError('Failed to render impact image', 'IMAGE_RENDERING_FAILED'));
    };
    img.src = url;
  });
}

export async function generateImpactImage(
  options: GenerateImpactImageOptions
): Promise<string> {
  const { stats, format = 'png', width = IMPACT_DEFAULT_W, height = IMPACT_DEFAULT_H } = options;
  validateImpactStats(stats);

  try {
    const svg = buildImpactSvg(stats, width, height);
    if (format === 'svg') {
      return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    }
    return await svgToPngDataUrl(svg, width, height);
  } catch (error) {
    if (error instanceof CertificateError) throw error;
    const message = error instanceof Error ? error.message : 'Unknown error during image generation';
    throw new CertificateError(message, 'IMAGE_GENERATION_FAILED');
  }
}

export class CertificateError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = 'CertificateError';
  }
}

function validateOptions({ qrDataUrl, data }: GenerateCertificateOptions): void {
  if (!qrDataUrl) {
    throw new CertificateError('QR data URL is required', 'MISSING_QR_DATA');
  }
  if (!data.transactionHash) {
    throw new CertificateError('Transaction hash is required', 'MISSING_TX_HASH');
  }
  if (data.treeCount < 0) {
    throw new CertificateError('Tree count must be non-negative', 'INVALID_TREE_COUNT');
  }
  if (data.co2Offset < 0) {
    throw new CertificateError('CO2 offset must be non-negative', 'INVALID_CO2_OFFSET');
  }
}

export async function generateCertificatePdf(options: GenerateCertificateOptions): Promise<void> {
  validateOptions(options);

  const { qrDataUrl, data } = options;

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const displayName = getDisplayName(data);
  const explorerUrl = getExplorerUrl(data.transactionHash, data.explorerBaseUrl);
  const projectLabel = truncate(data.projectName, 60);

  try {
    doc.setFillColor(STELLAR_NAVY);
    doc.rect(0, 0, PAGE_W, 52, 'F');
    doc.setFillColor(STELLAR_BLUE);
    doc.rect(0, 48, PAGE_W, 4, 'F');
    doc.setTextColor(WHITE);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    doc.text('IMPACT CERTIFICATE', PAGE_W / 2, 22, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.text('Environmental Impact Verification on Stellar', PAGE_W / 2, 32, { align: 'center' });
    doc.setFontSize(9);
    doc.text(`Issued: ${formatDate(data.retirementDate)}`, PAGE_W / 2, 42, { align: 'center' });

    const badgeX = PAGE_W - MARGIN - 32;
    const badgeY = 6;
    doc.setFillColor(STELLAR_GREEN);
    doc.roundedRect(badgeX, badgeY, 32, 10, 2, 2, 'F');
    doc.setTextColor(WHITE);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.text('✓ VERIFIED', badgeX + 16, badgeY + 6.5, { align: 'center' });

    let y = 64;
    doc.setTextColor(STELLAR_NAVY);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.text('This certifies that', PAGE_W / 2, y, { align: 'center' });

    y += 10;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(STELLAR_BLUE);
    doc.text(truncate(displayName, 55), PAGE_W / 2, y, { align: 'center' });

    y += 8;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(STELLAR_NAVY);
    doc.text('has contributed to environmental restoration through', PAGE_W / 2, y, {
      align: 'center',
    });

    y += 12;
    doc.setFillColor(LIGHT_GRAY);
    doc.roundedRect(MARGIN, y - 7, CONTENT_W, 24, 3, 3, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(STELLAR_NAVY);
    doc.text(`${data.treeCount.toLocaleString()} Trees Planted`, PAGE_W / 4 + 10, y + 4, {
      align: 'center',
    });
    doc.text(`${data.co2Offset.toLocaleString()} tCO2e Offset`, (PAGE_W * 3) / 4 - 10, y + 4, {
      align: 'center',
    });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(MID_GRAY);
    doc.text('Reforestation Impact', PAGE_W / 4 + 10, y + 10, { align: 'center' });
    doc.text('Estimated CO2 Sequestration', (PAGE_W * 3) / 4 - 10, y + 10, { align: 'center' });

    y += 30;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(STELLAR_NAVY);
    doc.text('Location & Timeline', PAGE_W / 2, y, { align: 'center' });

    y += 9;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(STELLAR_BLUE);
    doc.text(`${data.region} · Planted ${formatDate(data.plantingDate)}`, PAGE_W / 2, y, {
      align: 'center',
    });

    y += 8;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(STELLAR_NAVY);
    doc.text('Project: ' + projectLabel, PAGE_W / 2, y, { align: 'center' });

    if (data.projectDescription) {
      y += 8;
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(9);
      doc.setTextColor(MID_GRAY);
      const descLines = doc.splitTextToSize(truncate(data.projectDescription, 200), CONTENT_W);
      doc.text(descLines as string[], PAGE_W / 2, y, { align: 'center' });
      y += (descLines as string[]).length * 5;
    }

    y += 8;
    doc.setDrawColor(STELLAR_BLUE);
    doc.setLineWidth(0.5);
    doc.line(MARGIN, y, PAGE_W - MARGIN, y);

    y += 10;
    const qrSize = 38;
    const qrX = PAGE_W - MARGIN - qrSize;
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
      { align: 'center' }
    );

    const safeName = displayName.replace(/[^a-z0-9]/gi, '_').slice(0, 30);
    doc.save(`retirement-certificate-${safeName}.pdf`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error during PDF generation';
    throw new CertificateError(message, 'PDF_GENERATION_FAILED');
  }
}
