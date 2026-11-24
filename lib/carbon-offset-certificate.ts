/**
 * Carbon Offset Certificate generation service — Issue #1621.
 *
 * Provides functions to generate downloadable carbon offset certificates
 * for sponsored trees in both PDF and shareable image (PNG) formats.
 *
 * Each certificate embeds:
 *  - Species, planting date, location (region + coordinates)
 *  - Estimated CO₂ sequestration over time with explicit units and time periods
 *  - Scannable QR code linking directly to the live tree tracking page
 */

import QRCode from 'qrcode';
import { calculateTreeCarbonMetrics } from '@/lib/carbon/tree-carbon-metrics';
import type { Tree } from '@/lib/types/tree';

// Re-export the pure calculation and its type from the client-safe module so
// existing callers (API route, tests) continue to work without change.
export type { TreeCarbonMetrics } from '@/lib/carbon/tree-carbon-metrics';
export { calculateTreeCarbonMetrics } from '@/lib/carbon/tree-carbon-metrics';

export interface TreeCertificateDetails {
  treeId: string;
  id: string;
  species: string;
  plantedAt: string;
  formattedPlantedAt: string;
  region: string;
  lat: number;
  lng: number;
  formattedLocation: string;
  projectName: string;
  sponsorName: string;
  nftTokenId?: string;
  status: string;
  treeUrl: string;
  issuedDate: string;
  carbonMetrics: TreeCarbonMetrics;
}

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return 'Pending / Not yet planted';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return 'Pending / Not yet planted';
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function getAppUrl(origin?: string): string {
  if (origin && origin.startsWith('http')) return origin;
  return process.env.NEXT_PUBLIC_APP_URL || 'https://app.farmcredit.io';
}

/**
 * Extracts and prepares all tree certificate fields for rendering.
 */
export function getTreeCertificateDetails(tree: Tree, origin?: string): TreeCertificateDetails {
  const appUrl = getAppUrl(origin);
  const treeUrl = `${appUrl}/trees/${tree.treeId || tree.id}`;
  const carbonMetrics = calculateTreeCarbonMetrics(tree);

  const lat = typeof tree.lat === 'number' ? tree.lat : 0;
  const lng = typeof tree.lng === 'number' ? tree.lng : 0;
  const latStr = `${Math.abs(lat).toFixed(2)}° ${lat >= 0 ? 'N' : 'S'}`;
  const lngStr = `${Math.abs(lng).toFixed(2)}° ${lng >= 0 ? 'E' : 'W'}`;
  const formattedLocation = tree.region
    ? `${tree.region} (${latStr}, ${lngStr})`
    : `${latStr}, ${lngStr}`;

  const issuedDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return {
    treeId: tree.treeId || tree.id,
    id: tree.id,
    species: tree.species,
    plantedAt: tree.plantedAt || '',
    formattedPlantedAt: formatDate(tree.plantedAt),
    region: tree.region || 'Unknown region',
    lat,
    lng,
    formattedLocation,
    projectName: tree.projectName || 'FarmCredit Reforestation',
    sponsorName: tree.sponsorName?.trim() || 'Verified Sponsor',
    nftTokenId: tree.nftTokenId,
    status: tree.status,
    treeUrl,
    issuedDate,
    carbonMetrics,
  };
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Generates an SVG certificate that renders as a standalone shareable image.
 * Uses Stellar brand palette (#0D0B21, #14B6E7, #00B36B) and includes:
 * - Species, planting date, location
 * - CO₂ sequestration over time with units and time periods
 * - Scannable QR code linking to tree live tracking page
 */
export function buildCertificateSvg(
  details: TreeCertificateDetails,
  qrDataUrl: string,
  width = 1200,
  height = 800
): string {
  const pad = 50;
  const cardY = 320;
  const cardW = (width - pad * 2 - 45) / 4;
  const cardH = 130;

  const { carbonMetrics } = details;

  const cardsData = carbonMetrics.hasMissingFormula
    ? [
        {
          title: 'ESTIMATION STATUS',
          value: 'Pending Data',
          sub: 'Methodology Formula Missing',
          period: 'Notice',
        },
      ]
    : [
        {
          title: 'ANNUAL RATE',
          value: `${carbonMetrics.annualRateKg} kg`,
          sub: 'CO₂ per year',
          period: 'Next 12 Months',
        },
        {
          title: 'STORED TO DATE',
          value: `${carbonMetrics.storedToDateKg} kg`,
          sub: 'Cumulative stored',
          period: `Current Age: ${carbonMetrics.currentAgeYears} yrs`,
        },
        {
          title: '10-YEAR HORIZON',
          value: `${carbonMetrics.at10YearsKg} kg`,
          sub: 'Projected capture',
          period: '10-Year Period',
        },
        {
          title: 'AT MATURITY',
          value: `${carbonMetrics.atMaturityTonnes} t`,
          sub: `${carbonMetrics.atMaturityKg} kg total`,
          period: `${carbonMetrics.maturityYears}-Year Maturity`,
        },
      ];

  const cardsSvg = cardsData
    .map((c, i) => {
      const x = pad + i * (cardW + 15);
      return `
    <g>
      <rect x="${x}" y="${cardY}" width="${cardW}" height="${cardH}" rx="12" fill="#151b36" stroke="#252d56" stroke-width="1.5" />
      <text x="${x + cardW / 2}" y="${cardY + 28}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-weight="bold" font-size="11" fill="#14B6E7" letter-spacing="1">${escapeXml(c.title)}</text>
      <text x="${x + cardW / 2}" y="${cardY + 70}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-weight="bold" font-size="28" fill="#FFFFFF">${escapeXml(c.value)}</text>
      <text x="${x + cardW / 2}" y="${cardY + 92}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="12" fill="#94A3B8">${escapeXml(c.sub)}</text>
      <text x="${x + cardW / 2}" y="${cardY + 114}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="10" fill="#00B36B" font-weight="600">${escapeXml(c.period)}</text>
    </g>`;
    })
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0D0B21" />
      <stop offset="100%" stop-color="#141138" />
    </linearGradient>
    <linearGradient id="accentGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#14B6E7" />
      <stop offset="50%" stop-color="#00B36B" />
      <stop offset="100%" stop-color="#14B6E7" />
    </linearGradient>
  </defs>

  <!-- Background -->
  <rect width="${width}" height="${height}" fill="url(#bgGrad)" />
  <rect x="20" y="20" width="${width - 40}" height="${height - 40}" rx="16" fill="none" stroke="#252d56" stroke-width="2" />
  <rect x="24" y="24" width="${width - 48}" height="${height - 48}" rx="14" fill="none" stroke="#14B6E7" stroke-opacity="0.3" stroke-width="1" />

  <!-- Top Accent Band -->
  <rect x="20" y="20" width="${width - 40}" height="6" rx="3" fill="url(#accentGrad)" />

  <!-- Header -->
  <g transform="translate(${pad}, 60)">
    <text x="0" y="30" font-family="Helvetica, Arial, sans-serif" font-weight="bold" font-size="12" fill="#14B6E7" letter-spacing="3">FARMCREDIT · ON-CHAIN RESTORATION</text>
    <text x="0" y="65" font-family="Helvetica, Arial, sans-serif" font-weight="bold" font-size="32" fill="#FFFFFF" letter-spacing="1">CARBON OFFSET CERTIFICATE</text>
    <text x="0" y="90" font-family="Helvetica, Arial, sans-serif" font-size="13" fill="#94A3B8">Verified on the Stellar Network · Issued: ${escapeXml(details.issuedDate)}</text>

    <!-- Verified Badge -->
    <g transform="translate(${width - pad * 2 - 170}, 30)">
      <rect width="170" height="38" rx="8" fill="#00B36B" fill-opacity="0.2" stroke="#00B36B" stroke-width="1.5" />
      <text x="85" y="24" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-weight="bold" font-size="13" fill="#00B36B" letter-spacing="1">✓ VERIFIED OFFSET</text>
    </g>
  </g>

  <!-- Divider -->
  <line x1="${pad}" y1="180" x2="${width - pad}" y2="180" stroke="#252d56" stroke-width="1.5" />

  <!-- Tree Info Grid -->
  <g transform="translate(${pad}, 210)">
    <!-- Tree ID -->
    <g transform="translate(0, 0)">
      <text x="0" y="0" font-family="Helvetica, Arial, sans-serif" font-weight="bold" font-size="11" fill="#64748B" letter-spacing="1">TREE ID</text>
      <text x="0" y="24" font-family="Helvetica, Arial, sans-serif" font-weight="bold" font-size="18" fill="#FFFFFF">${escapeXml(details.treeId)}</text>
    </g>

    <!-- Species -->
    <g transform="translate(260, 0)">
      <text x="0" y="0" font-family="Helvetica, Arial, sans-serif" font-weight="bold" font-size="11" fill="#64748B" letter-spacing="1">SPECIES</text>
      <text x="0" y="24" font-family="Helvetica, Arial, sans-serif" font-weight="bold" font-size="18" fill="#14B6E7">${escapeXml(details.species)}</text>
    </g>

    <!-- Planting Date -->
    <g transform="translate(540, 0)">
      <text x="0" y="0" font-family="Helvetica, Arial, sans-serif" font-weight="bold" font-size="11" fill="#64748B" letter-spacing="1">PLANTING DATE</text>
      <text x="0" y="24" font-family="Helvetica, Arial, sans-serif" font-weight="bold" font-size="18" fill="#FFFFFF">${escapeXml(details.formattedPlantedAt)}</text>
    </g>

    <!-- Sponsor -->
    <g transform="translate(820, 0)">
      <text x="0" y="0" font-family="Helvetica, Arial, sans-serif" font-weight="bold" font-size="11" fill="#64748B" letter-spacing="1">SPONSORED BY</text>
      <text x="0" y="24" font-family="Helvetica, Arial, sans-serif" font-weight="bold" font-size="18" fill="#00B36B">${escapeXml(details.sponsorName)}</text>
    </g>

    <!-- Location & Project Row -->
    <g transform="translate(0, 58)">
      <text x="0" y="0" font-family="Helvetica, Arial, sans-serif" font-weight="bold" font-size="11" fill="#64748B" letter-spacing="1">LOCATION</text>
      <text x="0" y="20" font-family="Helvetica, Arial, sans-serif" font-size="15" fill="#E2E8F0">${escapeXml(details.formattedLocation)}</text>
    </g>
    <g transform="translate(540, 58)">
      <text x="0" y="0" font-family="Helvetica, Arial, sans-serif" font-weight="bold" font-size="11" fill="#64748B" letter-spacing="1">REFORESTATION PROJECT</text>
      <text x="0" y="20" font-family="Helvetica, Arial, sans-serif" font-size="15" fill="#E2E8F0">${escapeXml(details.projectName)}</text>
    </g>
  </g>

  <!-- CO2 Section Header -->
  <text x="${pad}" y="305" font-family="Helvetica, Arial, sans-serif" font-weight="bold" font-size="11" fill="#64748B" letter-spacing="1.5">ESTIMATED CO₂ SEQUESTRATION OVER TIME (${escapeXml(details.carbonMetrics.methodology)})</text>

  <!-- Metric Cards -->
  ${cardsSvg}

  <!-- QR and Verification Box -->
  <g transform="translate(${pad}, 480)">
    <rect width="${width - pad * 2}" height="200" rx="14" fill="#0a081a" stroke="#252d56" stroke-width="1.5" />

    <!-- QR Code -->
    <g transform="translate(30, 25)">
      <rect x="-6" y="-6" width="162" height="162" rx="8" fill="#FFFFFF" />
      <image href="${qrDataUrl}" xlink:href="${qrDataUrl}" x="0" y="0" width="150" height="150" />
    </g>

    <!-- Verification Details -->
    <g transform="translate(220, 45)">
      <text x="0" y="0" font-family="Helvetica, Arial, sans-serif" font-weight="bold" font-size="16" fill="#FFFFFF">Scan QR Code to Track Tree Live</text>
      <text x="0" y="25" font-family="Helvetica, Arial, sans-serif" font-size="13" fill="#94A3B8">Opens the live tracking page and audit record for tree ${escapeXml(details.treeId)}:</text>
      <text x="0" y="55" font-family="Helvetica, Arial, sans-serif" font-weight="bold" font-size="13" fill="#14B6E7">${escapeXml(details.treeUrl)}</text>

      <g transform="translate(0, 85)">
        <text x="0" y="0" font-family="Helvetica, Arial, sans-serif" font-size="12" fill="#64748B">Methodology: IPCC Tier 1 (Chapman–Richards / Chave 2014) · Allometric parameters from Global Wood Density Database</text>
        <text x="0" y="20" font-family="Helvetica, Arial, sans-serif" font-size="12" fill="#64748B">Permanent on-chain ledger proof · Non-transferable environmental impact certificate</text>
      </g>
    </g>
  </g>

  <!-- Footer -->
  <rect x="20" y="${height - 50}" width="${width - 40}" height="30" fill="#0D0B21" />
  <line x1="20" y1="${height - 50}" x2="${width - 20}" y2="${height - 50}" stroke="#252d56" stroke-width="1" />
  <text x="${width / 2}" y="${height - 30}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="11" fill="#64748B">
    FarmCredit Stellar App OS · Immutable · Verifiable · Permanent · ${escapeXml(details.treeUrl)}
  </text>
</svg>`;
}

/**
 * Generates the shareable image PNG buffer for a given tree.
 */
export async function generateTreeCertificatePng(
  tree: Tree,
  origin?: string
): Promise<{ pngBuffer: Buffer; details: TreeCertificateDetails }> {
  const details = getTreeCertificateDetails(tree, origin);
  const qrDataUrl = await QRCode.toDataURL(details.treeUrl, {
    margin: 1,
    width: 300,
    errorCorrectionLevel: 'M',
  });

  const svg = buildCertificateSvg(details, qrDataUrl);
  const sharp = (await import('sharp')).default;
  const pngBuffer = await sharp(Buffer.from(svg)).png().toBuffer();

  return { pngBuffer, details };
}
