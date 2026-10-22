import { ed25519 } from '@noble/curves/ed25519';
import { hexToBytes } from '@noble/hashes/utils';
import { describe, expect, it } from 'vitest';
import type { BuyerComplianceReport } from '@/lib/esg-reporting-v2';
import { buildCsrReportTemplate, signCsrReport } from '@/lib/csr-reporting';

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
  coBenefits: {
    topBenefits: [],
    allBenefits: [],
    totalBenefitInstances: 0,
  },
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

describe('CSR reporting templates', () => {
  it('builds a GRI-oriented template with gross emissions gaps explicit', () => {
    const template = buildCsrReportTemplate(report, 'gri');

    expect(template.standard).toBe('GRI Standards');
    expect(template.disclosures).toMatchObject({
      greenhouseGasInventory: {
        scope1TonnesCo2e: null,
        scope2TonnesCo2e: null,
        scope3TonnesCo2e: null,
      },
    });
    expect(template.dataGaps.length).toBeGreaterThan(0);
  });

  it('builds a TCFD template with its four disclosure pillars', () => {
    const template = buildCsrReportTemplate(report, 'tcfd');
    const disclosures = template.disclosures as Record<string, unknown>;

    expect(template.standard).toBe('TCFD');
    expect(Object.keys(disclosures)).toEqual([
      'governance',
      'strategy',
      'riskManagement',
      'metricsAndTargets',
    ]);
    expect(disclosures.metricsAndTargets).toMatchObject({
      offsetsPurchasedTonnesCo2e: 120,
      offsetsRetiredTonnesCo2e: 45,
    });
  });

  it('signs the timestamped report payload and rejects malformed signing keys', () => {
    const template = buildCsrReportTemplate(report, 'gri');
    const privateKeyHex = '0123456789abcdef'.repeat(4);
    const generatedAt = '2026-10-21T12:00:00.000Z';
    const signed = signCsrReport(template, privateKeyHex, generatedAt);
    const payload = new TextEncoder().encode(JSON.stringify({ generatedAt, report: template }));

    expect(signed.generatedAt).toBe(generatedAt);
    expect(
      ed25519.verify(
        hexToBytes(signed.integrity.signature),
        payload,
        hexToBytes(signed.integrity.publicKey)
      )
    ).toBe(true);
    expect(() => signCsrReport(template, 'too-short')).toThrow(
      'CSR_REPORT_SIGNING_PRIVATE_KEY_HEX must be a 32-byte hex seed.'
    );
  });
});
