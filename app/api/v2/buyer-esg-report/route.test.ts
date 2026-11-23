/**
 * GET /api/v2/buyer-esg-report?format=gri|tcfd — Issue #1670
 *
 * Covers the first two acceptance criteria at the transport level: the
 * corporate dashboard downloads GRI Standards and TCFD exports from the report
 * endpoint, and those exports come back signed and timestamped.
 *
 * The analytics/export layers are mocked so the test exercises only the route's
 * format handling, signing configuration and response headers.
 */

import { ed25519 } from '@noble/curves/ed25519';
import { hexToBytes } from '@noble/hashes/utils';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BuyerComplianceReport } from '@/lib/esg-reporting-v2';

const { complianceReport } = vi.hoisted(() => ({
  complianceReport: {
    reportId: 'ESG-BUYER-001-OCT2026',
    generatedAt: '2026-10-01T00:00:00.000Z',
    buyerId: 'buyer-001',
    companyName: 'Example Corp',
    period: {
      type: 'month',
      label: 'Oct 2026',
      start: '2026-10-01T00:00:00.000Z',
      end: '2026-10-31T23:59:59.999Z',
    },
    carbonOffsets: {
      totalTonnes: 120,
      activeTonnes: 75,
      retiredTonnes: 45,
      totalCostUsd: 6000,
      costPerTonUsd: 50,
      purchaseCount: 3,
      projectCount: 2,
      lineItems: [],
    },
    coBenefits: { topBenefits: [], allBenefits: [], totalBenefitInstances: 0 },
    supplyChain: {
      projectCount: 2,
      projects: [],
      avgDaysToRetirement: null,
      retirementRate: 37.5,
      stageCompletionSummary: {
        origination: 100,
        verification: 100,
        issuance: 100,
        purchase: 100,
        retirement: 50,
      },
    },
    disclaimers: [],
  } as BuyerComplianceReport,
}));

vi.mock('@/lib/api/buyer-analytics', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/buyer-analytics')>();
  return { ...actual, aggregateBuyerAnalytics: vi.fn(async () => ({})) };
});

vi.mock('@/lib/esg-reporting-v2', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/esg-reporting-v2')>();
  return { ...actual, buildBuyerComplianceReport: vi.fn(() => complianceReport) };
});

vi.mock('@/lib/esg-reporting/pdf-export-v2', () => ({
  generateBuyerComplianceReportPdf: () => new Uint8Array(),
  getPdfFilename: () => 'report.pdf',
}));

vi.mock('@/lib/esg-reporting/excel-export-v2', () => ({
  generateBuyerComplianceReportExcel: () => new Uint8Array(),
  getExcelFilename: () => 'report.xlsx',
}));

import { GET } from './route';

const PRIVATE_KEY_HEX = '0123456789abcdef'.repeat(4);

function reportUrl(params: Record<string, string>): NextRequest {
  return new NextRequest(
    `http://localhost/api/v2/buyer-esg-report?${new URLSearchParams(params).toString()}`
  );
}

function verifySignature(body: {
  generatedAt: string;
  report: unknown;
  integrity: { signature: string; publicKey: string };
}): boolean {
  const payload = new TextEncoder().encode(
    JSON.stringify({ generatedAt: body.generatedAt, report: body.report })
  );
  return ed25519.verify(
    hexToBytes(body.integrity.signature),
    payload,
    hexToBytes(body.integrity.publicKey)
  );
}

beforeEach(() => {
  process.env.CSR_REPORT_SIGNING_PRIVATE_KEY_HEX = PRIVATE_KEY_HEX;
});

afterEach(() => {
  delete process.env.CSR_REPORT_SIGNING_PRIVATE_KEY_HEX;
});

describe('GET /api/v2/buyer-esg-report (CSR exports)', () => {
  it('downloads a signed, timestamped GRI export', async () => {
    const res = await GET(
      reportUrl({
        buyerId: 'buyer-001',
        companyName: 'Example Corp',
        dataSource: 'ledger',
        format: 'gri',
      })
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Disposition')).toBe(
      'attachment; filename="gri-csr-ESG-BUYER-001-OCT2026.json"'
    );
    expect(res.headers.get('Cache-Control')).toBe('no-cache, no-store, must-revalidate');
    expect(body.standard).toBe('GRI Standards');
    expect(body.report.companyName).toBe('Example Corp');
    expect(body.integrity.algorithm).toBe('Ed25519');
    expect(Date.parse(body.generatedAt)).not.toBeNaN();
    expect(verifySignature(body)).toBe(true);
    expect(body.report.dataGaps.length).toBeGreaterThan(0);
  });

  it('downloads a signed TCFD export with its four disclosure pillars', async () => {
    const res = await GET(
      reportUrl({
        buyerId: 'buyer-001',
        companyName: 'Example Corp',
        dataSource: 'ledger',
        format: 'tcfd',
      })
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.standard).toBe('TCFD');
    expect(Object.keys(body.report.disclosures)).toEqual([
      'governance',
      'strategy',
      'riskManagement',
      'metricsAndTargets',
    ]);
    expect(body.report.disclosures.metricsAndTargets.offsetsPurchasedTonnesCo2e).toBe(120);
    expect(verifySignature(body)).toBe(true);
  });

  it('refuses to sign an export when the platform key is not configured', async () => {
    delete process.env.CSR_REPORT_SIGNING_PRIVATE_KEY_HEX;

    const res = await GET(
      reportUrl({ buyerId: 'buyer-001', dataSource: 'ledger', format: 'gri' })
    );

    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toMatchObject({
      error: expect.stringMatching(/signing is not configured/i),
    });
  });

  it('refuses signed exports over synthetic data', async () => {
    const res = await GET(reportUrl({ buyerId: 'buyer-001', format: 'gri' }));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: 'Signed CSR exports require dataSource=ledger.',
    });
  });

  it('falls back to the JSON report when no format or companyName is supplied', async () => {
    const res = await GET(reportUrl({ buyerId: 'buyer-001' }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.report.reportId).toBe('ESG-BUYER-001-OCT2026');
    expect(typeof body.generated).toBe('string');
  });

  it('requires a buyerId', async () => {
    const res = await GET(reportUrl({ dataSource: 'ledger', format: 'gri' }));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: expect.stringMatching(/buyerId/),
    });
  });
});
