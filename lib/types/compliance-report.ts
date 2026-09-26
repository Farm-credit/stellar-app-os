export type ComplianceRegime = 'SEC' | 'EPA' | 'CARBON_TAX';

export interface ComplianceReportInput {
  buyerId: string;
  reportingPeriodStart: string;
  reportingPeriodEnd: string;
  emissionsTonnes: number;
  offsetsTonnes: number;
  offsetSources?: string[];
  jurisdiction?: string;
  carbonTaxRate?: number;
}

export interface ComplianceReport {
  id: string;
  buyerId: string;
  regime: ComplianceRegime;
  reportingPeriod: { start: string; end: string };
  emissionsTonnes: number;
  offsetsTonnes: number;
  netEmissionsTonnes: number;
  coveragePercent: number;
  offsetSources: string[];
  jurisdiction?: string;
  carbonTaxDue?: number;
  generatedAt: string;
  methodologyVersion: string;
}

export interface ComplianceReportBundle {
  buyerId: string;
  reportingPeriod: { start: string; end: string };
  reports: ComplianceReport[];
  totals: { emissionsTonnes: number; offsetsTonnes: number; netEmissionsTonnes: number };
}
