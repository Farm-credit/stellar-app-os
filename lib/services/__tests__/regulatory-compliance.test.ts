/**
 * Tests for the regulatory compliance service — Issue #1373
 */
import { describe, it, expect } from 'vitest';
import {
  generateRegulatoryFilingReport,
  generateRegulatoryBundle,
  type RegulatoryFilingInput,
} from '../regulatory-compliance';

const BASE_INPUT: RegulatoryFilingInput = {
  buyerId: 'buyer-001',
  companyName: 'Acme Corp',
  reportingPeriodStart: '2025-01-01',
  reportingPeriodEnd: '2025-12-31',
  reportingYear: 2025,
  emissionsTonnes: 50_000,
  offsetsTonnes: 20_000,
};

describe('generateRegulatoryFilingReport', () => {
  it('generates a report with all three regimes by default', () => {
    const report = generateRegulatoryFilingReport(BASE_INPUT);
    expect(report.sec).toBeDefined();
    expect(report.epa).toBeDefined();
    expect(report.carbonTax).toBeDefined();
    expect(report.regimeReports).toHaveLength(3);
  });

  it('generates only selected regimes', () => {
    const report = generateRegulatoryFilingReport(BASE_INPUT, ['SEC']);
    expect(report.sec).toBeDefined();
    expect(report.epa).toBeUndefined();
    expect(report.carbonTax).toBeUndefined();
    expect(report.regimeReports).toHaveLength(1);
  });

  it('calculates net emissions correctly', () => {
    const report = generateRegulatoryFilingReport(BASE_INPUT);
    const { netEmissions } = report;
    expect(netEmissions.grossEmissionsTonnes).toBe(50_000);
    expect(netEmissions.totalOffsetsTonnes).toBe(20_000);
    expect(netEmissions.netEmissionsTonnes).toBe(30_000);
    expect(netEmissions.coveragePercent).toBe(40);
    expect(netEmissions.isNetZero).toBe(false);
  });

  it('reports isNetZero when offsets >= emissions', () => {
    const input = { ...BASE_INPUT, offsetsTonnes: 60_000 };
    const report = generateRegulatoryFilingReport(input);
    expect(report.netEmissions.isNetZero).toBe(true);
    expect(report.netEmissions.netEmissionsTonnes).toBe(0);
  });

  it('handles zero emissions without division errors', () => {
    const input = { ...BASE_INPUT, emissionsTonnes: 0, offsetsTonnes: 0 };
    const report = generateRegulatoryFilingReport(input);
    expect(report.netEmissions.coveragePercent).toBe(100);
    expect(report.netEmissions.netEmissionsTonnes).toBe(0);
  });

  it('SEC section marks materialClimateRisk when >= 25 000 tCO2e', () => {
    const report = generateRegulatoryFilingReport(BASE_INPUT);
    expect(report.sec!.materialClimateRisk).toBe(true);
  });

  it('SEC section does NOT mark material risk below threshold', () => {
    const input = { ...BASE_INPUT, emissionsTonnes: 10_000 };
    const report = generateRegulatoryFilingReport(input);
    expect(report.sec!.materialClimateRisk).toBe(false);
  });

  it('EPA section sets exceedsReportingThreshold correctly', () => {
    const report = generateRegulatoryFilingReport(BASE_INPUT);
    expect(report.epa!.exceedsReportingThreshold).toBe(true);

    const smallInput = { ...BASE_INPUT, emissionsTonnes: 5_000 };
    const smallReport = generateRegulatoryFilingReport(smallInput);
    expect(smallReport.epa!.exceedsReportingThreshold).toBe(false);
  });

  it('EPA section includes facilityId when provided', () => {
    const input = { ...BASE_INPUT, facilityId: 'FAC-12345' };
    const report = generateRegulatoryFilingReport(input);
    expect(report.epa!.facilityId).toBe('FAC-12345');
  });

  it('carbon tax section uses default rate when none provided', () => {
    const report = generateRegulatoryFilingReport(BASE_INPUT, ['CARBON_TAX']);
    expect(report.carbonTax!.taxRatePerTonne).toBeGreaterThan(0);
    expect(report.carbonTax!.estimatedTaxDue).toBeGreaterThanOrEqual(0);
  });

  it('carbon tax section uses provided carbonTaxRate', () => {
    const input = { ...BASE_INPUT, carbonTaxRate: 50 };
    const report = generateRegulatoryFilingReport(input, ['CARBON_TAX']);
    expect(report.carbonTax!.taxRatePerTonne).toBe(50);
  });

  it('carbon tax section uses CA state rate', () => {
    const input = { ...BASE_INPUT, state: 'CA' };
    const report = generateRegulatoryFilingReport(input, ['CARBON_TAX']);
    expect(report.carbonTax!.taxRatePerTonne).toBe(31.0);
    expect(report.carbonTax!.state).toBe('CA');
  });

  it('categorises offset positions as active vs retired', () => {
    const input: RegulatoryFilingInput = {
      ...BASE_INPUT,
      offsetsTonnes: 5_000,
      offsetPositions: [
        { creditId: 'CC-001', standard: 'Verra', tonnes: 3_000, status: 'retired', vintageYear: 2024 },
        { creditId: 'CC-002', standard: 'Gold Standard', tonnes: 2_000, status: 'active', vintageYear: 2025 },
      ],
    };
    const report = generateRegulatoryFilingReport(input);
    expect(report.netEmissions.retiredOffsetsTonnes).toBe(3_000);
    expect(report.netEmissions.activeOffsetsTonnes).toBe(2_000);
  });

  it('populates report metadata fields', () => {
    const report = generateRegulatoryFilingReport(BASE_INPUT);
    expect(report.buyerId).toBe('buyer-001');
    expect(report.companyName).toBe('Acme Corp');
    expect(report.reportingYear).toBe(2025);
    expect(report.methodologyVersion).toBe('2026.1');
    expect(report.disclaimers.length).toBeGreaterThan(0);
    expect(typeof report.generatedAt).toBe('string');
    expect(report.id).toMatch(/^reg-/);
  });

  it('includes regime-specific disclaimers', () => {
    const report = generateRegulatoryFilingReport(BASE_INPUT, ['SEC', 'EPA', 'CARBON_TAX']);
    const disclaimersText = report.disclaimers.join(' ');
    expect(disclaimersText).toContain('SEC');
    expect(disclaimersText).toContain('EPA');
    expect(disclaimersText).toContain('carbon-tax');
  });
});

describe('generateRegulatoryBundle', () => {
  it('returns a bundle with report and metadata', () => {
    const bundle = generateRegulatoryBundle(BASE_INPUT);
    expect(bundle.buyerId).toBe('buyer-001');
    expect(bundle.companyName).toBe('Acme Corp');
    expect(bundle.regimes).toEqual(['SEC', 'EPA', 'CARBON_TAX']);
    expect(bundle.report).toBeDefined();
    expect(bundle.generatedAt).toBeTruthy();
  });

  it('respects custom regimes in bundle', () => {
    const bundle = generateRegulatoryBundle(BASE_INPUT, ['EPA']);
    expect(bundle.regimes).toEqual(['EPA']);
    expect(bundle.report.epa).toBeDefined();
    expect(bundle.report.sec).toBeUndefined();
  });
});
