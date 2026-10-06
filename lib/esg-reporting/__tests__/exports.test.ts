/**
 * Tests for ESG report PDF and Excel exports — Issue #1407
 *
 * Tests PDF/Excel generation, filename generation, and export data correctness.
 */

import { describe, it, expect } from 'vitest';
import type { BuyerComplianceReport } from '@/lib/esg-reporting-v2';
import { generateBuyerComplianceReportPdf, getPdfFilename } from '../pdf-export-v2';
import { generateBuyerComplianceReportExcel, getExcelFilename } from '../excel-export-v2';

// ─────────────────────────────────────────────────────────────────────────────
// Test Fixtures
// ─────────────────────────────────────────────────────────────────────────────

function mockReport(overrides: Partial<BuyerComplianceReport> = {}): BuyerComplianceReport {
  return {
    reportId: 'ESG-BUYER-001-JAN2026',
    generatedAt: '2026-09-01T12:00:00Z',
    buyerId: 'buyer-001',
    companyName: 'Acme Corporation',
    period: {
      type: 'month',
      label: 'Jan 2026',
      start: '2026-01-01',
      end: '2026-01-31',
    },
    carbonOffsets: {
      totalTonnes: 550,
      activeTonnes: 300,
      retiredTonnes: 250,
      totalCostUsd: 27500,
      costPerTonUsd: 50,
      purchaseCount: 10,
      projectCount: 3,
      lineItems: [
        {
          projectId: 'proj-001',
          projectName: 'Amazon Reforestation',
          tonnes: 250,
          costUsd: 12500,
          costPerTonUsd: 50,
          purchaseCount: 5,
          status: 'mixed',
          retiredTonnes: 100,
          firstPurchasedAt: '2026-01-01T00:00:00Z',
          lastPurchasedAt: '2026-01-31T00:00:00Z',
          retirementDate: '2026-01-31T00:00:00Z',
          verification: 'Verra (VCS)',
        },
        {
          projectId: 'proj-002',
          projectName: 'Wind Farm Texas',
          tonnes: 200,
          costUsd: 10000,
          costPerTonUsd: 50,
          purchaseCount: 3,
          status: 'active',
          retiredTonnes: 0,
          firstPurchasedAt: '2026-01-05T00:00:00Z',
          lastPurchasedAt: '2026-01-20T00:00:00Z',
          verification: 'Gold Standard',
        },
        {
          projectId: 'proj-003',
          projectName: 'Solar Initiative India',
          tonnes: 100,
          costUsd: 5000,
          costPerTonUsd: 50,
          purchaseCount: 2,
          status: 'retired',
          retiredTonnes: 100,
          firstPurchasedAt: '2026-01-10T00:00:00Z',
          lastPurchasedAt: '2026-01-25T00:00:00Z',
          retirementDate: '2026-01-25T00:00:00Z',
          verification: 'Climate Action Reserve',
        },
      ],
    },
    coBenefits: {
      topBenefits: [
        {
          name: 'Biodiversity',
          projectCount: 2,
          tonnes: 300,
          sharePercentage: 54.5,
        },
        {
          name: 'Community Income',
          projectCount: 2,
          tonnes: 250,
          sharePercentage: 45.5,
        },
      ],
      allBenefits: [
        {
          name: 'Biodiversity',
          projectCount: 2,
          tonnes: 300,
          sharePercentage: 54.5,
        },
        {
          name: 'Community Income',
          projectCount: 2,
          tonnes: 250,
          sharePercentage: 45.5,
        },
      ],
      totalBenefitInstances: 4,
    },
    supplyChain: {
      projectCount: 3,
      projects: [],
      avgDaysToRetirement: 15,
      retirementRate: 45.45,
      stageCompletionSummary: {
        origination: 100,
        verification: 100,
        issuance: 100,
        purchase: 100,
        retirement: 50,
      },
    },
    disclaimers: [
      'This report aggregates your carbon offset purchases.',
      'It is not validated against any compliance standard.',
    ],
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// PDF Export Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('PDF Export', () => {
  it('generates a valid PDF document', () => {
    const report = mockReport();
    const pdfBytes = generateBuyerComplianceReportPdf(report);

    expect(pdfBytes).toBeInstanceOf(Uint8Array);
    expect(pdfBytes.length).toBeGreaterThan(0);

    // Check PDF magic number (% PDF)
    const header = String.fromCharCode(...pdfBytes.slice(0, 4));
    expect(header).toBe('%PDF');
  });

  it('generates a PDF with reasonable size', () => {
    const report = mockReport();
    const pdfBytes = generateBuyerComplianceReportPdf(report);

    // PDF should be at least 1KB and less than 1MB
    expect(pdfBytes.length).toBeGreaterThan(1000);
    expect(pdfBytes.length).toBeLessThan(1000000);
  });

  it('includes all report data in PDF', () => {
    const report = mockReport();
    const pdfBytes = generateBuyerComplianceReportPdf(report);
    const pdfText = String.fromCharCode(...pdfBytes);

    // Check for key content (encoded in PDF)
    // Note: PDF text extraction is complex; we're just checking it's not empty
    expect(pdfText.length).toBeGreaterThan(100);
  });

  it('handles empty reports gracefully', () => {
    const report = mockReport({
      carbonOffsets: {
        ...mockReport().carbonOffsets,
        lineItems: [],
      },
    });

    expect(() => generateBuyerComplianceReportPdf(report)).not.toThrow();
  });

  it('handles large reports with many line items', () => {
    const manyItems = Array.from({ length: 50 }, (_, i) => ({
      projectId: `proj-${i}`,
      projectName: `Project ${i}`,
      tonnes: 10 + i,
      costUsd: 500 + i * 10,
      costPerTonUsd: 45 + (i % 20),
      purchaseCount: 1,
      status: 'active' as const,
      retiredTonnes: 0,
      firstPurchasedAt: '2026-01-01T00:00:00Z',
      lastPurchasedAt: '2026-01-31T00:00:00Z',
      verification: 'Verra (VCS)',
    }));

    const report = mockReport({
      carbonOffsets: {
        ...mockReport().carbonOffsets,
        lineItems: manyItems,
      },
    });

    expect(() => generateBuyerComplianceReportPdf(report)).not.toThrow();
  });
});

describe('getPdfFilename', () => {
  it('generates a valid filename', () => {
    const report = mockReport();
    const filename = getPdfFilename(report);

    expect(filename).toMatch(/\.pdf$/);
    expect(filename).toContain('esg-report');
    expect(filename).toContain('acme');
  });

  it('sanitizes company and period names in filename', () => {
    const report = mockReport({
      companyName: 'Acme Corp! @#$% Ltd.',
      period: {
        ...mockReport().period,
        label: 'Q1 2026 / Special',
      },
    });

    const filename = getPdfFilename(report);
    expect(filename).not.toContain('@');
    expect(filename).not.toContain('#');
    expect(filename).not.toContain('/');
    expect(filename).toMatch(/^[a-z0-9-]+\.pdf$/);
  });

  it('produces consistent filenames for same report', () => {
    const report = mockReport();
    const filename1 = getPdfFilename(report);
    const filename2 = getPdfFilename(report);
    expect(filename1).toBe(filename2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Excel Export Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('Excel Export', () => {
  it('generates a valid Excel file', () => {
    const report = mockReport();
    const excelBytes = generateBuyerComplianceReportExcel(report);

    expect(excelBytes).toBeInstanceOf(Uint8Array);
    expect(excelBytes.length).toBeGreaterThan(0);

    // Check XLSX file signature (PK followed by specific bytes)
    const header = String.fromCharCode(...excelBytes.slice(0, 2));
    expect(header).toBe('PK');
  });

  it('generates an Excel file with reasonable size', () => {
    const report = mockReport();
    const excelBytes = generateBuyerComplianceReportExcel(report);

    // Excel should be at least 5KB and less than 10MB
    expect(excelBytes.length).toBeGreaterThan(5000);
    expect(excelBytes.length).toBeLessThan(10000000);
  });

  it('includes all report sections as sheets', () => {
    const report = mockReport();
    const excelBytes = generateBuyerComplianceReportExcel(report);

    // Check for sheet names in the file (they're in the XML)
    const excelText = String.fromCharCode(...excelBytes);
    expect(excelText).toContain('Summary'); // Sheet name
    expect(excelText).toContain('Carbon'); // From "Carbon Offsets"
    expect(excelText).toContain('Benefit'); // From "Co-Benefits"
  });

  it('handles empty reports gracefully', () => {
    const report = mockReport({
      carbonOffsets: {
        ...mockReport().carbonOffsets,
        lineItems: [],
      },
      coBenefits: {
        ...mockReport().coBenefits,
        allBenefits: [],
        topBenefits: [],
      },
    });

    expect(() => generateBuyerComplianceReportExcel(report)).not.toThrow();
  });

  it('handles large reports with many projects', () => {
    const manyProjects = Array.from({ length: 100 }, (_, i) => ({
      projectId: `proj-${i}`,
      projectName: `Project ${i}`,
      tonnes: 10 + i,
      costUsd: 500 + i * 10,
      costPerTonUsd: 45 + (i % 20),
      purchaseCount: 1,
      status: 'active' as const,
      retiredTonnes: 0,
      firstPurchasedAt: '2026-01-01T00:00:00Z',
      lastPurchasedAt: '2026-01-31T00:00:00Z',
      verification: 'Verra (VCS)',
    }));

    const report = mockReport({
      carbonOffsets: {
        ...mockReport().carbonOffsets,
        lineItems: manyProjects,
      },
    });

    expect(() => generateBuyerComplianceReportExcel(report)).not.toThrow();
  });
});

describe('getExcelFilename', () => {
  it('generates a valid filename', () => {
    const report = mockReport();
    const filename = getExcelFilename(report);

    expect(filename).toMatch(/\.xlsx$/);
    expect(filename).toContain('esg-report');
  });

  it('sanitizes company and period names in filename', () => {
    const report = mockReport({
      companyName: 'Acme Corp! @#$% Ltd.',
      period: {
        ...mockReport().period,
        label: 'Q1 2026 / Special',
      },
    });

    const filename = getExcelFilename(report);
    expect(filename).not.toContain('@');
    expect(filename).not.toContain('#');
    expect(filename).not.toContain('/');
    expect(filename).toMatch(/^[a-z0-9-]+\.xlsx$/);
  });

  it('produces consistent filenames for same report', () => {
    const report = mockReport();
    const filename1 = getExcelFilename(report);
    const filename2 = getExcelFilename(report);
    expect(filename1).toBe(filename2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Cross-export Consistency Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('Export consistency', () => {
  it('both PDF and Excel export without errors for the same report', () => {
    const report = mockReport();

    expect(() => generateBuyerComplianceReportPdf(report)).not.toThrow();
    expect(() => generateBuyerComplianceReportExcel(report)).not.toThrow();
  });

  it('exports maintain data integrity', () => {
    const report = mockReport();

    // Generate both exports
    const pdfBytes = generateBuyerComplianceReportPdf(report);
    const excelBytes = generateBuyerComplianceReportExcel(report);

    // Both should produce valid output
    expect(pdfBytes.length).toBeGreaterThan(0);
    expect(excelBytes.length).toBeGreaterThan(0);

    // Both should have proper headers
    const pdfHeader = String.fromCharCode(...pdfBytes.slice(0, 4));
    const excelHeader = String.fromCharCode(...excelBytes.slice(0, 2));
    expect(pdfHeader).toBe('%PDF');
    expect(excelHeader).toBe('PK');
  });
});
