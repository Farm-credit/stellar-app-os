import type {
  ComplianceRegime,
  ComplianceReport,
  ComplianceReportBundle,
  ComplianceReportInput,
} from '@/lib/types/compliance-report';

const reports = new Map<string, ComplianceReport>();
const round = (value: number, digits = 3) => Number(value.toFixed(digits));

export function calculateCompliance(
  input: ComplianceReportInput,
  regime: ComplianceRegime
): ComplianceReport {
  if (!input.buyerId.trim()) throw new Error('buyerId is required');
  if (
    !input.reportingPeriodStart ||
    !input.reportingPeriodEnd ||
    input.reportingPeriodEnd <= input.reportingPeriodStart
  ) {
    throw new Error('reporting period end must be after start');
  }
  if (!Number.isFinite(input.emissionsTonnes) || input.emissionsTonnes < 0)
    throw new Error('emissionsTonnes must be non-negative');
  if (!Number.isFinite(input.offsetsTonnes) || input.offsetsTonnes < 0)
    throw new Error('offsetsTonnes must be non-negative');
  if (
    regime === 'CARBON_TAX' &&
    input.carbonTaxRate !== undefined &&
    (!Number.isFinite(input.carbonTaxRate) || input.carbonTaxRate < 0)
  ) {
    throw new Error('carbonTaxRate must be non-negative');
  }
  const net = Math.max(0, input.emissionsTonnes - input.offsetsTonnes);
  const report: ComplianceReport = {
    id: `compliance_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    buyerId: input.buyerId,
    regime,
    reportingPeriod: { start: input.reportingPeriodStart, end: input.reportingPeriodEnd },
    emissionsTonnes: round(input.emissionsTonnes),
    offsetsTonnes: round(input.offsetsTonnes),
    netEmissionsTonnes: round(net),
    coveragePercent:
      input.emissionsTonnes === 0
        ? 100
        : round(Math.min(100, (input.offsetsTonnes / input.emissionsTonnes) * 100), 2),
    offsetSources: input.offsetSources ?? [],
    jurisdiction: input.jurisdiction,
    carbonTaxDue: regime === 'CARBON_TAX' ? round(net * (input.carbonTaxRate ?? 0), 2) : undefined,
    generatedAt: new Date().toISOString(),
    methodologyVersion: '2026.1',
  };
  reports.set(report.id, report);
  return report;
}

export function generateComplianceBundle(
  input: ComplianceReportInput,
  regimes: ComplianceRegime[] = ['SEC', 'EPA', 'CARBON_TAX']
): ComplianceReportBundle {
  const uniqueRegimes = [...new Set(regimes)];
  if (!uniqueRegimes.length) throw new Error('At least one compliance regime is required');
  const generated = uniqueRegimes.map((regime) => calculateCompliance(input, regime));
  return {
    buyerId: input.buyerId,
    reportingPeriod: { start: input.reportingPeriodStart, end: input.reportingPeriodEnd },
    reports: generated,
    totals: {
      emissionsTonnes: generated[0].emissionsTonnes,
      offsetsTonnes: generated[0].offsetsTonnes,
      netEmissionsTonnes: generated[0].netEmissionsTonnes,
    },
  };
}

export function listComplianceReports(buyerId?: string): ComplianceReport[] {
  return [...reports.values()]
    .filter((report) => !buyerId || report.buyerId === buyerId)
    .sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));
}
