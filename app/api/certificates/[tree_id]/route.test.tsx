import { beforeEach, describe, expect, it, vi } from 'vitest';
import QRCode from 'qrcode';
import jsQR from 'jsqr';
import sharp from 'sharp';

vi.mock('@react-pdf/renderer', () => {
  const Component = ({ children }: { children?: unknown }) => children ?? null;
  return {
    Document: Component,
    Page: Component,
    Text: Component,
    View: Component,
    Image: Component,
    StyleSheet: { create: (styles: unknown) => styles },
    renderToBuffer: vi.fn().mockResolvedValue(Buffer.from('%PDF-1.4 Mock PDF Certificate Data')),
  };
});

import { GET } from './route';

describe('GET /api/certificates/[tree_id]', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('generates a PDF certificate whose QR code contains the public live tracking tree ID', async () => {
    const qrDataUrlSpy = vi.spyOn(QRCode, 'toDataURL');

    const response = await GET(new Request('http://localhost') as never, {
      params: Promise.resolve({ tree_id: 'tree-001' }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/pdf');
    expect(response.headers.get('Content-Disposition')).toContain('certificate-HRV-2024-0001.pdf');
    expect(qrDataUrlSpy).toHaveBeenCalled();

    const qrDataUrl = await qrDataUrlSpy.mock.results[0].value;
    const qrPng = Buffer.from(qrDataUrl.split(',')[1], 'base64');
    const { data, info } = await sharp(qrPng).ensureAlpha().raw().toBuffer({
      resolveWithObject: true,
    });
    const decoded = jsQR(new Uint8ClampedArray(data), info.width, info.height);

    expect(decoded?.data).toBe('https://app.farmcredit.io/trees/HRV-2024-0001');
  });

  it('generates a shareable image (PNG) when requested via ?format=png', async () => {
    const response = await GET(
      new Request('http://localhost/api/certificates/tree-001?format=png') as never,
      {
        params: Promise.resolve({ tree_id: 'tree-001' }),
      }
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/png');
    expect(response.headers.get('Content-Disposition')).toContain('certificate-HRV-2024-0001.png');

    const arrayBuffer = await response.arrayBuffer();
    const pngBuffer = Buffer.from(arrayBuffer);

    // Verify valid PNG image
    const metadata = await sharp(pngBuffer).metadata();
    expect(metadata.format).toBe('png');
    expect(metadata.width).toBe(1200);
    expect(metadata.height).toBe(800);

    // Extract the QR code region from the exported certificate image and decode it
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
  }, 30000);

  it('returns JSON data including carbon metrics and sequestration over time when ?format=json is passed', async () => {
    const response = await GET(
      new Request('http://localhost/api/certificates/tree-001?format=json') as never,
      {
        params: Promise.resolve({ tree_id: 'tree-001' }),
      }
    );

    expect(response.status).toBe(200);
    const json = await response.json();

    expect(json.personalData).toBeDefined();
    expect(json.personalData.treeId).toBe('HRV-2024-0001');
    expect(json.personalData.species).toBe('Teak');
    expect(json.personalData.plantedAt).toBe('Mar 12, 2024');
    expect(json.personalData.region).toBe('Kano, Nigeria');
    expect(json.personalData.treeUrl).toBe('https://app.farmcredit.io/trees/HRV-2024-0001');

    const metrics = json.personalData.carbonMetrics;
    expect(metrics).toBeDefined();
    expect(metrics.annualRateKg).toBeGreaterThan(0);
    expect(metrics.annualRateUnit).toBe('kg CO₂ / year');
    expect(metrics.storedToDateKg).toBeGreaterThanOrEqual(0);
    expect(metrics.at10YearsKg).toBeGreaterThan(0);
    expect(metrics.atMaturityTonnes).toBeGreaterThan(0);
    expect(metrics.maturityYears).toBe(20);
    expect(metrics.hasMissingFormula).toBe(false);
  });

  it('end-to-end: generates both formats for multiple sponsored trees and decodes QR codes to their specific live tracking pages', async () => {
    const testCases = [
      { id: 'tree-001', treeId: 'HRV-2024-0001', species: 'Teak' },
      { id: 'tree-002', treeId: 'HRV-2024-0002', species: 'Moringa' },
      { id: 'tree-003', treeId: 'HRV-2024-0003', species: 'Eucalyptus' },
    ];

    for (const tc of testCases) {
      // 1. Verify PDF download
      const pdfRes = await GET(
        new Request(`http://localhost/api/certificates/${tc.id}?format=pdf`) as never,
        {
          params: Promise.resolve({ tree_id: tc.id }),
        }
      );
      expect(pdfRes.status).toBe(200);
      expect(pdfRes.headers.get('Content-Type')).toBe('application/pdf');
      expect(pdfRes.headers.get('Content-Disposition')).toContain(`certificate-${tc.treeId}.pdf`);

      // 2. Verify Image download and decode embedded QR
      const pngRes = await GET(
        new Request(`http://localhost/api/certificates/${tc.id}?format=png`) as never,
        {
          params: Promise.resolve({ tree_id: tc.id }),
        }
      );
      expect(pngRes.status).toBe(200);
      expect(pngRes.headers.get('Content-Type')).toBe('image/png');
      expect(pngRes.headers.get('Content-Disposition')).toContain(`certificate-${tc.treeId}.png`);

      const pngBuf = Buffer.from(await pngRes.arrayBuffer());
      const metadata = await sharp(pngBuf).metadata();
      expect(metadata.format).toBe('png');

      const qrRegion = await sharp(pngBuf)
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
      expect(decoded?.data).toBe(`https://app.farmcredit.io/trees/${tc.treeId}`);
    }
  }, 45000);
});
