/**
 * Tests for the buyer ESG disclosure helpers — Issue #1317
 */

import { describe, expect, it } from 'vitest';
import type { BuyerAnalyticsSummary } from '@/lib/api/buyer-analytics';
import {
  buildEsgInputFromAnalytics,
  createEsgDisclosure,
  parseEsgOffsetsParam,
  parseEsgShareParams,
  type EsgDisclosureInput,
} from '@/lib/esg-disclosure';

function makeSummary(): BuyerAnalyticsSummary {
  return {
    totals: { totalTonnes: 96.04, sequestrationTonnes: 48 },
    supplyChain: [
      {
        projectId: 'p1',
        projectName: 'Kenya Mangrove Planting',
        platform: 'gold-standard',
        assetType: 'credit',
        projectType: 'Blue carbon',
        tonnes: 48.04,
      },
      {
        projectId: 'p2',
        projectName: 'Farm Trees',
        platform: 'tree-registry',
        assetType: 'sequestration',
        projectType: null,
        tonnes: 48,
      },
    ],
  } as unknown as BuyerAnalyticsSummary;
}

describe('buildEsgInputFromAnalytics', () => {
  const input = buildEsgInputFromAnalytics(makeSummary(), {
    companyName: 'Acme',
    period: 'Q2 2026',
  });

  it('maps real totals and keeps the provided company and period', () => {
    expect(input.companyName).toBe('Acme');
    expect(input.period).toBe('Q2 2026');
    expect(input.totalCo2Offset).toBe(96);
  });

  it('derives trees from sequestration tonnes at 48 kg per tree', () => {
    expect(input.totalTrees).toBe(1000);
  });

  it('builds a line item per project with readable credit type and verification', () => {
    expect(input.offsets).toEqual([
      {
        projectName: 'Kenya Mangrove Planting',
        creditType: 'Blue carbon',
        tonnesCo2e: 48,
        verification: 'Gold Standard',
      },
      {
        projectName: 'Farm Trees',
        creditType: 'Tree sequestration',
        tonnesCo2e: 48,
        verification: 'Tree registry',
      },
    ]);
    expect(input.projectsSupported).toEqual(['Kenya Mangrove Planting', 'Farm Trees']);
  });
});

describe('createEsgDisclosure', () => {
  const base: EsgDisclosureInput = {
    companyName: 'Acme',
    period: 'Q1 2026',
    totalTrees: 10,
    totalCo2Offset: 1,
    projectsSupported: ['A'],
  };

  it('does not substitute sample offsets when none are provided', () => {
    expect(createEsgDisclosure(base).offsets).toEqual([]);
    expect(createEsgDisclosure({ ...base, offsets: [] }).offsets).toEqual([]);
  });

  it('omits the offsets param from the share path when there are none', () => {
    expect(createEsgDisclosure(base).sharePath).not.toContain('offsets=');
  });
});

describe('share link round trip', () => {
  it('preserves offset line items so recipients see the same report', () => {
    const input = buildEsgInputFromAnalytics(makeSummary(), {
      companyName: 'Acme & Sons',
      period: 'Q2 2026',
    });
    const { sharePath } = createEsgDisclosure(input);
    const parsed = parseEsgShareParams(new URL(sharePath, 'https://x.test').searchParams);

    expect(parsed.companyName).toBe('Acme & Sons');
    expect(parsed.offsets).toEqual(input.offsets);
    expect(parsed.coBenefits).toEqual(input.coBenefits);
    expect(parsed.supplyChain).toEqual(input.supplyChain);
    expect(parsed.totalCo2Offset).toBe(input.totalCo2Offset);
  });
});

describe('parseEsgOffsetsParam', () => {
  it('returns [] for missing, malformed or non-array input', () => {
    expect(parseEsgOffsetsParam(null)).toEqual([]);
    expect(parseEsgOffsetsParam('not json')).toEqual([]);
    expect(parseEsgOffsetsParam('{"a":1}')).toEqual([]);
  });

  it('drops invalid lines and keeps valid ones', () => {
    const raw = JSON.stringify([
      { projectName: 'Ok', creditType: 'ARR', tonnesCo2e: 5, verification: 'Verra VCS' },
      { projectName: 'Negative', creditType: 'ARR', tonnesCo2e: -1, verification: 'x' },
      { projectName: 'Missing tonnes', creditType: 'ARR', verification: 'x' },
      null,
    ]);
    expect(parseEsgOffsetsParam(raw)).toEqual([
      { projectName: 'Ok', creditType: 'ARR', tonnesCo2e: 5, verification: 'Verra VCS' },
    ]);
  });
});

describe('parseEsgCoBenefitsParam', () => {
  it('returns [] for missing or malformed input', () => {
    expect(parseEsgCoBenefitsParam(null)).toEqual([]);
    expect(parseEsgCoBenefitsParam('invalid')).toEqual([]);
  });

  it('parses valid co-benefit lines correctly', () => {
    const raw = JSON.stringify([
      { name: 'Biodiversity', tonnes: 300, sharePercentage: 60 },
      { name: 'Invalid', tonnes: -5, sharePercentage: 10 },
    ]);
    expect(parseEsgCoBenefitsParam(raw)).toEqual([
      { name: 'Biodiversity', tonnes: 300, sharePercentage: 60 },
    ]);
  });
});

describe('parseEsgSupplyChainParam', () => {
  it('returns [] for missing or malformed input', () => {
    expect(parseEsgSupplyChainParam(null)).toEqual([]);
    expect(parseEsgSupplyChainParam('invalid')).toEqual([]);
  });

  it('parses valid supply chain lines correctly', () => {
    const raw = JSON.stringify([
      {
        projectName: 'Amazon',
        location: 'Brazil',
        tonnesCo2e: 180,
        retiredTonnes: 50,
        stageSummary: '4/5 complete',
      },
    ]);
    expect(parseEsgSupplyChainParam(raw)).toEqual([
      {
        projectName: 'Amazon',
        location: 'Brazil',
        tonnesCo2e: 180,
        retiredTonnes: 50,
        stageSummary: '4/5 complete',
      },
    ]);
  });
});
