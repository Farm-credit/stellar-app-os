/**
 * POST /api/v2/csr-report/verify — Issue #1670
 *
 * Covers the third acceptance criterion end to end: a report exported from the
 * corporate dashboard is signed and timestamped by the platform, and the
 * verify endpoint reports whether that envelope is intact.
 */

import { ed25519 } from '@noble/curves/ed25519';
import { hexToBytes } from '@noble/hashes/utils';
import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { buildCsrReportTemplate, signCsrReport, type SignedCsrReport } from '@/lib/csr-reporting';
import { GET, POST } from './route';
import type { BuyerComplianceReport } from '@/lib/esg-reporting-v2';

const PRIVATE_KEY_HEX = '0123456789abcdef'.repeat(4);
const GENERATED_AT = '2026-10-21T12:00:00.000Z';

const report: BuyerComplianceReport = {
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
};

function signedGriReport(): SignedCsrReport {
  return signCsrReport(buildCsrReportTemplate(report, 'gri'), PRIVATE_KEY_HEX, GENERATED_AT);
}

function postJson(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/v2/csr-report/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/v2/csr-report/verify', () => {
  it('accepts an untampered signed export and echoes its integrity metadata', async () => {
    const signed = signedGriReport();
    const res = await POST(postJson(signed));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(body).toMatchObject({
      valid: true,
      standard: 'GRI Standards',
      reportId: 'ESG-BUYER-001-OCT2026',
      companyName: 'Example Corp',
      generatedAt: GENERATED_AT,
      publicKey: signed.integrity.publicKey,
    });
    expect(body.error).toBeUndefined();
  });

  it('rejects a report whose impact figures were altered after signing', async () => {
    const signed = signedGriReport();
    const tampered: SignedCsrReport = {
      ...signed,
      report: {
        ...signed.report,
        disclosures: {
          ...signed.report.disclosures,
          climateAndNature: { carbonOffsetPurchases: { totalTonnes: 999_999 } },
        },
      },
    };

    const res = await POST(postJson(tampered));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.valid).toBe(false);
  });

  it('rejects a report whose timestamp was altered after signing', async () => {
    const signed = signedGriReport();
    const res = await POST(postJson({ ...signed, generatedAt: '2030-01-01T00:00:00.000Z' }));
    const body = await res.json();

    expect(body.valid).toBe(false);
  });

  it('returns 200 with valid:false for a non-hex signature instead of throwing', async () => {
    const signed = signedGriReport();
    const res = await POST(
      postJson({ ...signed, integrity: { ...signed.integrity, signature: 'zz' } })
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.valid).toBe(false);
    expect(typeof body.error).toBe('string');
  });

  it('returns 400 for a body that is not a SignedCsrReport', async () => {
    const res = await POST(postJson({ hello: 'world' }));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: expect.stringMatching(/Invalid request body/),
    });
  });

  it('returns 400 when the body is not valid JSON', async () => {
    const req = new NextRequest('http://localhost/api/v2/csr-report/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{not json',
    });
    const res = await POST(req);

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: 'Request body must be valid JSON.',
    });
  });

  it('advertises POST only on GET', async () => {
    const res = await GET();

    expect(res.status).toBe(405);
    expect(res.headers.get('Allow')).toBe('POST');
  });
});

describe('signed export integrity', () => {
  it('signs the timestamped report payload with the platform key', () => {
    const signed = signedGriReport();
    const payload = new TextEncoder().encode(
      JSON.stringify({ generatedAt: GENERATED_AT, report: signed.report })
    );

    expect(
      ed25519.verify(
        hexToBytes(signed.integrity.signature),
        payload,
        hexToBytes(signed.integrity.publicKey)
      )
    ).toBe(true);
  });
});
