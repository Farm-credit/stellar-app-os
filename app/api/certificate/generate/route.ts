import { type NextRequest, NextResponse } from 'next/server';
import jsPDF from 'jspdf';
import QRCode from 'qrcode';

export const runtime = 'nodejs';

interface CertificateApiRequest {
  userName?: string | null;
  walletAddress: string;
  treeCount: number;
  co2Offset: number;
  plantingDate: string;
  region: string;
  projectName: string;
  projectDescription?: string;
  transactionHash: string;
  retirementDate: string;
  isAnonymous?: boolean;
  explorerBaseUrl?: string;
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

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function getDisplayName(
  userName: string | null | undefined,
  walletAddress: string,
  isAnonymous?: boolean
): string {
  if (isAnonymous) return 'Anonymous Donor';
  return userName?.trim() || walletAddress;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    let body: CertificateApiRequest;
    try {
      body = (await request.json()) as CertificateApiRequest;
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    if (!body.transactionHash) {
      return NextResponse.json({ error: 'transactionHash is required' }, { status: 400 });
    }
    if (body.treeCount < 0 || body.co2Offset < 0) {
      return NextResponse.json(
        { error: 'treeCount and co2Offset must be non-negative' },
        { status: 400 }
      );
    }

    const explorerBaseUrl = body.explorerBaseUrl ?? 'https://stellar.expert/explorer/public/tx';
    const explorerUrl = `${explorerBaseUrl}/${body.transactionHash}`;

    const qrDataUrl = await QRCode.toDataURL(explorerUrl, { width: 200, margin: 1 });

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const displayName = getDisplayName(body.userName, body.walletAddress, body.isAnonymous);

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
    doc.text(`Issued: ${formatDate(body.retirementDate)}`, PAGE_W / 2, 42, { align: 'center' });

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
    doc.text(`${body.treeCount.toLocaleString()} Trees Planted`, PAGE_W / 4 + 10, y + 4, {
      align: 'center',
    });
    doc.text(`${body.co2Offset.toLocaleString()} tCO2e Offset`, (PAGE_W * 3) / 4 - 10, y + 4, {
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
    doc.text(`${body.region} · Planted ${formatDate(body.plantingDate)}`, PAGE_W / 2, y, {
      align: 'center',
    });

    y += 8;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(STELLAR_NAVY);
    doc.text('Project: ' + truncate(body.projectName, 60), PAGE_W / 2, y, { align: 'center' });

    if (body.projectDescription) {
      y += 8;
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(9);
      doc.setTextColor(MID_GRAY);
      const descLines = doc.splitTextToSize(truncate(body.projectDescription, 200), CONTENT_W);
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
    doc.text(truncate(body.transactionHash, 56), MARGIN + 3, y + 2.5);

    y += 14;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(STELLAR_BLUE);
    doc.text(truncate(explorerUrl, 70), MARGIN, y);

    const qrY = y - 30;
    doc.addImage(qrDataUrl, 'PNG', qrX, qrY, qrSize, qrSize);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(MID_GRAY);
    doc.text('Scan to verify', qrX + qrSize / 2, qrY + qrSize + 4, { align: 'center' });

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

    const pdfBuffer = Buffer.from(doc.output('arraybuffer'));

    const safeName = displayName.replace(/[^a-z0-9]/gi, '_').slice(0, 30);
    const filename = `retirement-certificate-${safeName}.pdf`;

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': pdfBuffer.length.toString(),
      },
    });
  } catch (error) {
    console.error('[certificate/generate] error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
