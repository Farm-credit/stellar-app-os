export type ComplianceReportFormat = 'csv' | 'json';
export type ComplianceRegistry =
  | 'verra'
  | 'gold-standard'
  | 'car'
  | 'plan-vivo'
  | 'cdm'
  | 'generic';
export type ComplianceReportType =
  | 'project-registry'
  | 'carbon-credits'
  | 'tree-inventory'
  | 'verification-audit'
  | 'issuance-report'
  | 'retirement-report';

export interface ComplianceReportConfig {
  format: ComplianceReportFormat;
  registry: ComplianceRegistry;
  reportType: ComplianceReportType;
  dateRange: {
    start: Date;
    end: Date;
  };
  filters?: ComplianceFilters;
  includeMetadata?: boolean;
}

export interface ComplianceFilters {
  projectIds?: string[];
  regions?: string[];
  species?: string[];
  verificationStatus?: string[];
  sponsorAddresses?: string[];
  minCo2OffsetKg?: number;
  maxCo2OffsetKg?: number;
}

export interface ComplianceReportMetadata {
  reportId: string;
  generatedAt: string;
  generatedBy: string;
  format: ComplianceReportFormat;
  registry: ComplianceRegistry;
  reportType: ComplianceReportType;
  dateRange: {
    start: string;
    end: string;
  };
  filters?: ComplianceFilters;
  totalRecords: number;
  schemaVersion: string;
}

export interface CarbonCreditRecord {
  creditId: string;
  projectId: string;
  projectName: string;
  registry: ComplianceRegistry;
  vintageYear: number;
  quantityTonnes: number;
  serialNumber?: string;
  issuanceDate: string;
  retirementDate?: string;
  retirementReason?: string;
  status: 'issued' | 'retired' | 'pending' | 'cancelled';
  sponsorAddress?: string;
  coBenefits?: string[];
}

export interface ProjectRegistryRecord {
  projectId: string;
  projectName: string;
  registry: ComplianceRegistry;
  projectType: string;
  location: {
    country: string;
    region: string;
    coordinates: {
      latitude: number;
      longitude: number;
    };
  };
  verificationStandard: string;
  validationDate: string;
  verificationDate?: string;
  verifierName?: string;
  totalAreaHectares: number;
  estimatedAnnualCo2Tonnes: number;
  status: 'registered' | 'validated' | 'verified' | 'issued' | 'completed';
  sponsorAddress?: string;
}

export interface TreeInventoryRecord {
  treeId: string;
  projectId: string;
  projectName: string;
  species: string;
  region: string;
  coordinates: {
    latitude: number;
    longitude: number;
  };
  plantedAt: string;
  status: string;
  co2OffsetKgPerYear: number;
  totalCo2OffsetKg: number;
  verificationStatus: string;
  sponsorAddress?: string;
  vintageYear: number;
}

export interface VerificationAuditRecord {
  auditId: string;
  projectId: string;
  projectName: string;
  auditorName: string;
  auditDate: string;
  auditType: 'validation' | 'verification' | 'surveillance';
  standard: string;
  findings: string[];
  nonConformities: number;
  status: 'passed' | 'failed' | 'pending' | 'conditional';
  nextAuditDue?: string;
}

export interface IssuanceReportRecord {
  issuanceId: string;
  projectId: string;
  projectName: string;
  registry: ComplianceRegistry;
  vintageYear: number;
  quantityIssued: number;
  issuanceDate: string;
  serialNumberRange: {
    start: string;
    end: string;
  };
  sponsorAddress?: string;
  status: 'pending' | 'completed' | 'rejected';
}

export interface RetirementReportRecord {
  retirementId: string;
  projectId: string;
  projectName: string;
  registry: ComplianceRegistry;
  vintageYear: number;
  quantityRetired: number;
  retirementDate: string;
  retirementReason: string;
  beneficiary?: string;
  serialNumbersRetired: string[];
  sponsorAddress?: string;
  status: 'completed' | 'pending';
}

export type ComplianceRecord =
  | CarbonCreditRecord
  | ProjectRegistryRecord
  | TreeInventoryRecord
  | VerificationAuditRecord
  | IssuanceReportRecord
  | RetirementReportRecord;

export interface ComplianceReportResponse {
  metadata: ComplianceReportMetadata;
  data: ComplianceRecord[];
  csvContent?: string;
  jsonContent?: string;
}

export interface ScheduledExportConfig {
  enabled: boolean;
  cronExpression: string;
  reportType: ComplianceReportType;
  format: ComplianceReportFormat;
  registry: ComplianceRegistry;
  outputPath: string;
  emailRecipients?: string[];
  webhookUrl?: string;
  retentionDays: number;
}

export interface ExportJobResult {
  jobId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt: string;
  completedAt?: string;
  reportId?: string;
  filePath?: string;
  error?: string;
  recordsExported?: number;
}
