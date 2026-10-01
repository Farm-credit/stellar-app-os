/**
 * Tests for ESG reporting v2 — Issue #1407
 *
 * Tests the report building logic, period labeling, and export data generation.
 */

import { describe, it, expect } from 'vitest';
import type {
  BuyerAnalyticsSummary,
  BuyerOffsetTotals,
  CoBenefitSummary,
  SupplyChainProject,
  SupplyChainStage,
} from '@/lib/api/buyer-analytics';
import {
  buildBuyerComplianceReport,
  buildReportId,
  buildPeriodLabel,
  isValidComplianceReport,
} from '@/lib/esg-reporting-v2';

// ─────────────────────────────────────────────────────────────────────────────
// Test Fixtures
// ─────────────────────────────────────────────────────────────────────────────

function mockStage(
  stage: string,
  status: 'complete' | 'pending' | 'not-applicable' = 'complete'
): SupplyChainStage {
  return {
    stage: stage as any,
    status,
    detail: `${stage} completed`,
    at: '2026-08-01T12:00:00Z',
  };
}

function mockSupplyChainProject(overrides: Partial<SupplyChainProject> = {}): SupplyChainProject {
  return {
    projectId: 'proj-001',
    projectName: 'Amazon Reforestation',
    platform: 'verra',
    assetType: 'credit',
    projectType: 'Reforestation',
    location: 'Brazil',
    vintages: [2024],
    coBenefits: ['Biodiversity', 'Community Income'],
    purchaseCount: 5,
    tonnes: 100,
    retiredTonnes: 50,
    costUsd: 5000,
    costPerTonUsd: 50,
    firstPurchasedAt: '2026-01-01T00:00:00Z',
    lastPurchasedAt: '2026-08-15T00:00:00Z',
    stages: [
      mockStage('origination'),
      mockStage('verification'),
      mockStage('issuance'),
      mockStage('purchase'),
      mockStage('retirement'),
    ],
    ...overrides,
  };
}

function mockCoBenefit(overrides: Partial<CoBenefitSummary> = {}): CoBenefitSummary {
  return {
    name: 'Biodiversity',
    projectCount: 3,
    tonnes: 250,
    sharePercentage: 45.5,
    ...overrides,
  };
}

function mockTotals(overrides: Partial<BuyerOffsetTotals> = {}): BuyerOffsetTotals {
  return {
    purchaseCount: 10,
    projectCount: 5,
    totalTonnes: 550,
    creditTonnes: 350,
    sequestrationTonnes: 200,
    activeTonnes: 300,
    retiredTonnes: 250,
    totalCostUsd: 27500,
    pricedTonnes: 500,
    costPerTonUsd: 55,
    minCostPerTonUsd: 35,
    maxCostPerTonUsd: 75,
    retirementCount: 8,
    ...overrides,
  };
}

function mockBuyerAnalytics(
  overrides: Partial<BuyerAnalyticsSummary> = {}
): BuyerAnalyticsSummary {
  return {
    buyerId: 'buyer-001',
    account: null,
    generatedAt: '2026-09-01T12:00:00Z',
    filters: {
      platforms: null,
      projectIds: null,
      status: 'all',
      from: '2026-01-01',
      to: '2026-08-31',
      interval: 'month',
    },
    totals: mockTotals(),
    coBenefits: [mockCoBenefit()],
    supplyChain: [mockSupplyChainProject()],
    trends: {
      interval: 'month',
      direction: 'up',
      tonnesChangePercentage: 12.5,
      costPerTonChangePercentage: -2.3,
      points: [],
    },
    sourceStatuses: [],
    invalidPositionCount: 0,
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Report Building Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('buildBuyerComplianceReport', () => {
  it('builds a valid report from analytics', () => {
    const analytics = mockBuyerAnalytics();
    const report = buildBuyerComplianceReport(analytics, 'Acme Corp', 'month');

    expect(report.reportId).toMatch(/^ESG-/);
    expect(report.buyerId).toBe('buyer-001');
    expect(report.companyName).toBe('Acme Corp');
    expect(report.period.label).toBeTruthy();
    expect(report.carbonOffsets.totalTonnes).toBe(550);
    expect(report.coBenefits.allBenefits.length).toBeGreaterThan(0);
    expect(report.supplyChain.projectCount).toBe(1);
    expect(report.disclaimers.length).toBeGreaterThan(0);
  });

  it('sets company name to buyer ID if not provided', () => {
    const analytics = mockBuyerAnalytics();
    const report = buildBuyerComplianceReport(analytics, '', 'month');
    expect(report.companyName).toBe('buyer-001');
  });

  it('correctly aggregates carbon offsets', () => {
    const analytics = mockBuyerAnalytics({
      totals: mockTotals({
        totalTonnes: 1000,
        activeTonnes: 600,
        retiredTonnes: 400,
        totalCostUsd: 50000,
      }),
    });

    const report = buildBuyerComplianceReport(analytics, 'Test Corp', 'month');
    expect(report.carbonOffsets.totalTonnes).toBe(1000);
    expect(report.carbonOffsets.activeTonnes).toBe(600);
    expect(report.carbonOffsets.retiredTonnes).toBe(400);
    expect(report.carbonOffsets.totalCostUsd).toBe(50000);
    expect(report.carbonOffsets.lineItems.length).toBe(1);
  });

  it('handles zero purchases gracefully', () => {
    const analytics = mockBuyerAnalytics({
      totals: mockTotals({ purchaseCount: 0, projectCount: 0, totalTonnes: 0 }),
      supplyChain: [],
      coBenefits: [],
    });

    const report = buildBuyerComplianceReport(analytics, 'Empty Corp', 'month');
    expect(report.carbonOffsets.lineItems.length).toBe(0);
    expect(report.coBenefits.allBenefits.length).toBe(0);
    expect(report.supplyChain.projectCount).toBe(0);
  });

  it('includes all disclaimers in report', () => {
    const analytics = mockBuyerAnalytics();
    const report = buildBuyerComplianceReport(analytics, 'Test', 'month');

    const disclaimers = report.disclaimers.join(' ').toLowerCase();
    expect(disclaimers).toContain('not validated');
    expect(disclaimers).toContain('ghg protocol');
    expect(disclaimers).toContain('compliance');
  });

  it('extracts top 5 co-benefits correctly', () => {
    const analytics = mockBuyerAnalytics({
      coBenefits: [
        mockCoBenefit({ name: 'Biodiversity', tonnes: 500 }),
        mockCoBenefit({ name: 'Community Income', tonnes: 400 }),
        mockCoBenefit({ name: 'Water Conservation', tonnes: 300 }),
        mockCoBenefit({ name: 'Education', tonnes: 200 }),
        mockCoBenefit({ name: 'Health', tonnes: 100 }),
        mockCoBenefit({ name: 'Energy Access', tonnes: 50 }),
      ],
    });

    const report = buildBuyerComplianceReport(analytics, 'Test', 'month');
    expect(report.coBenefits.topBenefits.length).toBeLessThanOrEqual(5);
    expect(report.coBenefits.allBenefits.length).toBe(6);
  });

  it('calculates supply chain metrics correctly', () => {
    const analytics = mockBuyerAnalytics({
      supplyChain: [
        mockSupplyChainProject({
          tonnes: 100,
          retiredTonnes: 100, // 100% retired
        }),
        mockSupplyChainProject({
          projectId: 'proj-002',
          tonnes: 100,
          retiredTonnes: 0, // 0% retired
        }),
      ],
    });

    const report = buildBuyerComplianceReport(analytics, 'Test', 'month');
    expect(report.supplyChain.retirementRate).toBe(50); // 100 of 200 tonnes retired
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ID & Label Generation Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('buildReportId', () => {
  it('generates unique IDs from buyer ID and period', () => {
    const period1 = {
      type: 'month' as const,
      label: 'Jan 2026',
      start: '2026-01-01',
      end: '2026-01-31',
    };
    const period2 = {
      type: 'month' as const,
      label: 'Feb 2026',
      start: '2026-02-01',
      end: '2026-02-28',
    };

    const id1 = buildReportId('buyer-001', period1);
    const id2 = buildReportId('buyer-001', period2);
    expect(id1).not.toBe(id2);
    expect(id1).toMatch(/^ESG-/);
    expect(id2).toMatch(/^ESG-/);
  });

  it('sanitizes buyer ID and period for use in report ID', () => {
    const period = {
      type: 'month' as const,
      label: 'Q1 2026',
      start: '2026-01-01',
      end: '2026-03-31',
    };

    const id = buildReportId('buyer@001!', period);
    expect(id).not.toContain('@');
    expect(id).not.toContain('!');
    expect(id).toMatch(/^ESG-[A-Z0-9-]+/);
  });
});

describe('buildPeriodLabel', () => {
  it('formats month periods correctly', () => {
    const label = buildPeriodLabel('2026-01-15', '2026-01-31', 'month');
    expect(label).toMatch(/Jan.*2026/i);
  });

  it('formats quarter periods correctly', () => {
    const label = buildPeriodLabel('2026-01-01', '2026-03-31', 'quarter');
    expect(label).toMatch(/Q1.*2026/i);
  });

  it('formats custom periods with date range', () => {
    const label = buildPeriodLabel('2026-01-15', '2026-03-31', 'custom');
    expect(label).toMatch(/Jan.*Mar/i);
    expect(label).toMatch(/2026/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Validation Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('isValidComplianceReport', () => {
  it('validates a complete report', () => {
    const analytics = mockBuyerAnalytics();
    const report = buildBuyerComplianceReport(analytics, 'Test', 'month');
    expect(isValidComplianceReport(report)).toBe(true);
  });

  it('rejects null or undefined', () => {
    expect(isValidComplianceReport(null)).toBe(false);
    expect(isValidComplianceReport(undefined)).toBe(false);
  });

  it('rejects incomplete objects', () => {
    expect(isValidComplianceReport({ reportId: 'test' })).toBe(false);
    expect(isValidComplianceReport({})).toBe(false);
  });

  it('checks for required fields', () => {
    const analytics = mockBuyerAnalytics();
    const report = buildBuyerComplianceReport(analytics, 'Test', 'month');

    // Delete required field
    const incomplete = { ...report };
    delete incomplete.reportId;
    expect(isValidComplianceReport(incomplete)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Data Integrity Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('Report data integrity', () => {
  it('maintains data consistency between sections', () => {
    const analytics = mockBuyerAnalytics({
      supplyChain: [
        mockSupplyChainProject({
          projectId: 'proj-001',
          tonnes: 100,
          costUsd: 5000,
          coBenefits: ['Biodiversity', 'Community Income'],
        }),
        mockSupplyChainProject({
          projectId: 'proj-002',
          projectName: 'Wind Farm',
          tonnes: 50,
          costUsd: 2000,
          coBenefits: ['Community Income', 'Jobs'],
        }),
      ],
      coBenefits: [
        mockCoBenefit({ name: 'Biodiversity', tonnes: 100 }),
        mockCoBenefit({ name: 'Community Income', tonnes: 150 }),
      ],
    });

    const report = buildBuyerComplianceReport(analytics, 'Test', 'month');

    // Carbon offsets should sum correctly
    expect(report.carbonOffsets.totalTonnes).toBe(150);
    expect(report.carbonOffsets.lineItems.length).toBe(2);

    // Co-benefits should match projects
    expect(report.coBenefits.allBenefits.length).toBe(2);

    // Supply chain should have all projects
    expect(report.supplyChain.projectCount).toBe(2);
    expect(report.supplyChain.projects.length).toBe(2);
  });

  it('rounds numeric values correctly', () => {
    const analytics = mockBuyerAnalytics({
      totals: mockTotals({
        totalTonnes: 123.456789,
        costPerTonUsd: 45.123456789,
        totalCostUsd: 5555.555555,
      }),
    });

    const report = buildBuyerComplianceReport(analytics, 'Test', 'month');
    
    // Should be rounded to 4 decimals for tonnes
    expect(report.carbonOffsets.totalTonnes.toString().split('.')[1]?.length || 0).toBeLessThanOrEqual(4);
    
    // Should be rounded to 2 decimals for USD
    const costStr = report.carbonOffsets.totalCostUsd.toString();
    expect(costStr.split('.')[1]?.length || 0).toBeLessThanOrEqual(2);
  });
});
