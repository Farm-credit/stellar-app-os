import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import jsQR from 'jsqr';
import {
  calculateTreeCarbonMetrics,
  getTreeCertificateDetails,
  buildCertificateSvg,
  generateTreeCertificatePng,
} from '@/lib/carbon-offset-certificate';
import { getMockTrees } from '@/lib/api/mock/trees';
import type { Tree } from '@/lib/types/tree';

describe('Carbon Offset Certificate Service (#1621)', () => {
  const trees = getMockTrees();
  const teakTree = trees.find((t) => t.species === 'Teak' && t.treeId === 'HRV-2024-0001')!;

  describe('calculateTreeCarbonMetrics', () => {
    it('calculates carbon sequestration over time using IPCC Tier 1 allometry for known species', () => {
      const metrics = calculateTreeCarbonMetrics(teakTree);

      expect(metrics.hasMissingFormula).toBe(false);
      expect(metrics.annualRateKg).toBeGreaterThan(0);
      expect(metrics.annualRateUnit).toBe('kg CO₂ / year');
      expect(metrics.storedToDateKg).toBeGreaterThanOrEqual(0);
      expect(metrics.storedToDateUnit).toBe('kg CO₂');
      expect(metrics.at10YearsKg).toBeGreaterThan(0);
      expect(metrics.at25YearsKg).toBeGreaterThan(metrics.at10YearsKg);
      expect(metrics.atMaturityKg).toBeGreaterThan(0);
      expect(metrics.atMaturityTonnes).toBeGreaterThan(0);
      expect(metrics.maturityYears).toBe(20);
      expect(metrics.methodology).toContain('IPCC Tier 1');
    });

    it('flags missing formula rather than inventing values for an unknown species', () => {
      const unknownTree: Tree = {
        id: 'tree-unknown',
        treeId: 'HRV-UNKNOWN-001',
        species: 'Fictional Martian Pine' as any,
        region: 'Olympus Mons',
        status: 'planted',
        lat: 0,
        lng: 0,
        co2OffsetKgPerYear: 15,
        projectName: 'Off-world',
      };

      const metrics = calculateTreeCarbonMetrics(unknownTree);

      expect(metrics.hasMissingFormula).toBe(true);
      expect(metrics.missingFormulaReason).toContain('Allometric parameters not defined');
      expect(metrics.storedToDateKg).toBe(0);
      expect(metrics.at10YearsKg).toBe(0);
      expect(metrics.atMaturityKg).toBe(0);
    });
  });

  describe('getTreeCertificateDetails', () => {
    it('extracts all required certificate fields and formats the live tracking URL', () => {
      const details = getTreeCertificateDetails(teakTree, 'https://app.farmcredit.io');

      expect(details.treeId).toBe('HRV-2024-0001');
      expect(details.species).toBe('Teak');
      expect(details.formattedPlantedAt).toBe('March 12, 2024');
      expect(details.region).toBe('Kano, Nigeria');
      expect(details.formattedLocation).toContain('Kano, Nigeria');
      expect(details.formattedLocation).toContain('12.04° N, 8.48° E');
      expect(details.sponsorName).toBe('Acme EcoSolutions');
      expect(details.treeUrl).toBe('https://app.farmcredit.io/trees/HRV-2024-0001');
      expect(details.carbonMetrics.annualRateKg).toBeGreaterThan(0);
    });
  });

  describe('buildCertificateSvg', () => {
    it('creates a complete SVG document containing species, planting date, location, CO2 metrics and QR image', () => {
      const details = getTreeCertificateDetails(teakTree, 'https://app.farmcredit.io');
      const fakeQrDataUrl =
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      const svg = buildCertificateSvg(details, fakeQrDataUrl, 1200, 800);

      expect(svg).toContain('<svg');
      expect(svg).toContain('CARBON OFFSET CERTIFICATE');
      expect(svg).toContain('Teak');
      expect(svg).toContain('March 12, 2024');
      expect(svg).toContain('Kano, Nigeria');
      expect(svg).toContain('Acme EcoSolutions');
      expect(svg).toContain('ANNUAL RATE');
      expect(svg).toContain('STORED TO DATE');
      expect(svg).toContain('10-YEAR HORIZON');
      expect(svg).toContain('AT MATURITY');
      expect(svg).toContain(fakeQrDataUrl);
      expect(svg).toContain('https://app.farmcredit.io/trees/HRV-2024-0001');
    });
  });

  describe('generateTreeCertificatePng', () => {
    it('generates a valid high-resolution PNG image with a scannable QR code pointing to live tracking', async () => {
      const { pngBuffer, details } = await generateTreeCertificatePng(
        teakTree,
        'https://app.farmcredit.io'
      );

      expect(pngBuffer).toBeInstanceOf(Buffer);
      expect(pngBuffer.length).toBeGreaterThan(1000);

      // Verify the PNG image opens correctly and has expected dimensions
      const metadata = await sharp(pngBuffer).metadata();
      expect(metadata.format).toBe('png');
      expect(metadata.width).toBe(1200);
      expect(metadata.height).toBe(800);

      // Extract the QR code region from the certificate image and decode it
      // In the SVG, the QR box is inside translate(pad=50, 480) + translate(30, 25) with width=150, height=150.
      // Total X: 50 + 30 = 80; Total Y: 480 + 25 = 505
      const qrRegion = await sharp(pngBuffer)
        .extract({ left: 70, top: 495, width: 170, height: 170 })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

      const decoded = jsQR(
        new Uint8ClampedArray(qrRegion.data),
        qrRegion.info.width,
        qrRegion.info.height
      );

      expect(decoded).not.toBeNull();
      expect(decoded?.data).toBe('https://app.farmcredit.io/trees/HRV-2024-0001');
      expect(decoded?.data).toBe(details.treeUrl);
    }, 30000);
  });
});
