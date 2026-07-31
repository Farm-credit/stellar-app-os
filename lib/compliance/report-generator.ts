import { parseISO, format, startOfDay, endOfDay, subDays, addDays } from 'date-fns';
import type {
  ComplianceReportType,
  ComplianceReportFormat,
  ComplianceRegistry,
  CarbonCreditRecord,
  ProjectRegistryRecord,
  TreeInventoryRecord,
  VerificationAuditRecord,
  IssuanceReportRecord,
  RetirementReportRecord,
  ComplianceRecord,
  ComplianceReportMetadata,
  ComplianceReportResponse,
  ScheduledExportConfig,
  ExportJobResult,
} from './types';
import { getMockTrees } from '@/lib/api/mock/trees';
import { TREE_SPECIES } from '@/lib/constants/species';
import { logger } from '@/lib/logger';

let reportGeneratorInstance: ComplianceReportGenerator | null = null;

export function getComplianceReportGenerator(
  config?: Partial<ScheduledExportConfig>
): ComplianceReportGenerator {
  if (!reportGeneratorInstance) {
    reportGeneratorInstance = new ComplianceReportGenerator(config);
  }
  return reportGeneratorInstance;
}

export class ComplianceReportGenerator {
  private config: ScheduledExportConfig;
  private jobHistory: ExportJobResult[] = [];
  private isRunning = false;

  constructor(config?: Partial<ScheduledExportConfig>) {
    this.config = {
      enabled: config?.enabled ?? false,
      cronExpression: config?.cronExpression ?? '0 2 * * *',
      reportType: config?.reportType ?? 'carbon-credits',
      format: config?.format ?? 'csv',
      registry: config?.registry ?? 'verra',
      outputPath: config?.outputPath ?? './exports/compliance',
      emailRecipients: config?.emailRecipients ?? [],
      webhookUrl: config?.webhookUrl,
      retentionDays: config?.retentionDays ?? 90,
    };
  }

  async generateReport(
    reportType: ComplianceReportType,
    format: ComplianceReportFormat,
    registry: ComplianceRegistry,
    dateRange?: { startDate: Date; endDate: Date },
    filters?: {
      projectIds?: string[];
      sponsorAddresses?: string[];
      status?: string[];
      species?: string[];
      regions?: string[];
      minCo2OffsetKg?: number;
      maxCo2OffsetKg?: number;
    }
  ): Promise<ComplianceReportResponse> {
    const startTime = Date.now();
    const reportId = `compliance-${reportType}-${registry}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    logger.info('Generating compliance report', {
      reportId,
      reportType,
      format,
      registry,
      dateRange,
      filters,
    });

    const data = await this.fetchReportData(reportType, registry, dateRange, filters);
    const metadata = this.buildMetadata(
      reportId,
      reportType,
      format,
      registry,
      data.length,
      dateRange,
      filters,
      startTime
    );

    let csvContent: string | undefined;
    let jsonContent: string | undefined;

    if (format === 'csv' || format === 'both') {
      csvContent = this.generateCSV(data, reportType);
    }
    if (format === 'json' || format === 'both') {
      jsonContent = this.generateJSON(data, metadata);
    }

    return {
      metadata,
      data,
      csvContent,
      jsonContent,
    };
  }

  private fetchReportData(
    reportType: ComplianceReportType,
    registry: ComplianceRegistry,
    dateRange?: { startDate: Date; endDate: Date },
    _filters?: {
      projectIds?: string[];
      sponsorAddresses?: string[];
      status?: string[];
      species?: string[];
      regions?: string[];
      minCo2OffsetKg?: number;
      maxCo2OffsetKg?: number;
    }
  ): Promise<ComplianceRecord[]> {
    const mockTrees = getMockTrees();
    const speciesMap = new Map(TREE_SPECIES.map((s) => [s.name, s]));

    const filteredTrees = this.applyFilters(mockTrees, _filters);

    switch (reportType) {
      case 'carbon-credits':
        return this.generateCarbonCreditRecords(
          filteredTrees,
          speciesMap,
          registry,
          dateRange,
          _filters
        );
      case 'project-registry':
        return this.generateProjectRegistryRecords(
          filteredTrees,
          speciesMap,
          registry,
          dateRange,
          _filters
        );
      case 'tree-inventory':
        return this.generateTreeInventoryRecords(
          filteredTrees,
          speciesMap,
          registry,
          dateRange,
          _filters
        );
      case 'verification-audits':
        return this.generateVerificationAuditRecords(filteredTrees, registry, dateRange, _filters);
      case 'issuance-report':
        return this.generateIssuanceReportRecords(filteredTrees, registry, dateRange, _filters);
      case 'retirement-report':
        return this.generateRetirementReportRecords(filteredTrees, registry, dateRange, _filters);
      default:
        throw new Error(`Unknown report type: ${reportType}`);
    }
  }

  private applyFilters(
    trees: ReturnType<typeof getMockTrees>,
    filters?: {
      projectIds?: string[];
      sponsorAddresses?: string[];
      status?: string[];
      species?: string[];
      regions?: string[];
      minCo2OffsetKg?: number;
      maxCo2OffsetKg?: number;
    }
  ): ReturnType<typeof getMockTrees> {
    if (!filters) return trees;

    return trees.filter((tree) => {
      if (filters.projectIds && !filters.projectIds.includes(tree.id)) return false;
      if (
        filters.sponsorAddresses &&
        tree.sponsorAddress &&
        !filters.sponsorAddresses.includes(tree.sponsorAddress)
      )
        return false;
      if (filters.status && !filters.status.includes(tree.status)) return false;
      if (filters.species && !filters.species.includes(tree.species)) return false;
      if (filters.regions && !filters.regions.includes(tree.region)) return false;
      if (
        filters.minCo2OffsetKg !== undefined &&
        (tree.co2OffsetKgPerYear ?? 0) < filters.minCo2OffsetKg
      )
        return false;
      if (
        filters.maxCo2OffsetKg !== undefined &&
        (tree.co2OffsetKgPerYear ?? 0) > filters.maxCo2OffsetKg
      )
        return false;
      return true;
    });
  }

  private generateCarbonCreditRecords(
    trees: ReturnType<typeof getMockTrees>,
    speciesMap: Map<string, (typeof TREE_SPECIES)[0]>,
    registry: ComplianceRegistry,
    dateRange?: { startDate: Date; endDate: Date },
    _filters?: { projectIds?: string[]; sponsorAddresses?: string[]; status?: string[] }
  ): CarbonCreditRecord[] {
    const records: CarbonCreditRecord[] = [];
    let serialBase = 1000000 + Math.floor(Math.random() * 9000000);

    for (const tree of trees) {
      if (dateRange) {
        const plantedDate = tree.plantedAt ? parseISO(tree.plantedAt) : new Date();
        if (
          plantedDate < startOfDay(dateRange.startDate) ||
          plantedDate > endOfDay(dateRange.endDate)
        )
          continue;
      }

      const speciesInfo = speciesMap.get(tree.species);
      const vintageYear = tree.plantedAt
        ? parseISO(tree.plantedAt).getFullYear()
        : new Date().getFullYear();
      const co2PerTree = tree.co2OffsetKgPerYear ?? speciesInfo?.co2KgPerYear ?? 48;
      const quantity = Math.max(1, Math.floor(co2PerTree / 1000));

      const creditId = `CC-${registry.toUpperCase()}-${vintageYear}-${serialBase++}`;
      const serialNumber = `${registry.toUpperCase()}-${vintageYear}-${String(serialBase - 1).padStart(6, '0')}`;

      records.push({
        creditId,
        projectId: tree.id,
        projectName: tree.projectName,
        registry,
        vintageYear,
        quantityTonnes: quantity,
        serialNumber,
        issuanceDate: tree.plantedAt ?? new Date().toISOString(),
        retirementDate:
          tree.status === 'verified' && Math.random() > 0.7
            ? addDays(new Date(), -Math.floor(Math.random() * 365)).toISOString()
            : undefined,
        retirementReason:
          tree.status === 'verified' && Math.random() > 0.7 ? 'Voluntary Retirement' : undefined,
        status: this.mapTreeStatusToCreditStatus(tree.status),
        sponsorAddress: tree.sponsorAddress ?? `G${'X'.repeat(55)}`,
        coBenefits: ['Biodiversity', 'Community Development', 'Soil Conservation'],
      });
    }

    return records;
  }

  private generateProjectRegistryRecords(
    trees: ReturnType<typeof getMockTrees>,
    speciesMap: Map<string, (typeof TREE_SPECIES)[0]>,
    registry: ComplianceRegistry,
    dateRange?: { startDate: Date; endDate: Date },
    filters?: { projectIds?: string[]; sponsorAddresses?: string[]; status?: string[] }
  ): ProjectRegistryRecord[] {
    const projects = new Map<string, ReturnType<typeof getMockTrees>[0]>();

    for (const tree of trees) {
      if (!projects.has(tree.projectName)) {
        projects.set(tree.projectName, tree);
      }
    }

    const records: ProjectRegistryRecord[] = [];

    for (const [projectName, tree] of projects) {
      if (filters?.projectIds && !filters.projectIds.includes(tree.id)) continue;

      const projectTrees = trees.filter((t) => t.projectName === projectName);
      const totalArea = projectTrees.length * 0.5;
      const estimatedAnnualCo2 =
        projectTrees.reduce((sum, t) => sum + (t.co2OffsetKgPerYear ?? 0), 0) / 1000;

      records.push({
        projectId: tree.id,
        projectName,
        registry,
        projectType: 'Reforestation',
        location: {
          country: tree.region.split(', ')[1] ?? 'Nigeria',
          region: tree.region.split(', ')[0] ?? 'Unknown',
          coordinates: {
            latitude: tree.lat,
            longitude: tree.lng,
          },
        },
        verificationStandard: this.getVerificationStandard(registry),
        validationDate: tree.plantedAt ?? new Date().toISOString(),
        verificationDate: tree.status === 'verified' ? tree.plantedAt : undefined,
        verifierName: this.getRandomVerifier(),
        totalAreaHectares: totalArea,
        estimatedAnnualCo2Tonnes: Math.round(estimatedAnnualCo2 * 100) / 100,
        status: this.mapProjectStatus(tree.status),
        sponsorAddress: tree.sponsorAddress,
      });
    }

    return records;
  }

  private generateTreeInventoryRecords(
    trees: ReturnType<typeof getMockTrees>,
    speciesMap: Map<string, (typeof TREE_SPECIES)[0]>,
    registry: ComplianceRegistry,
    dateRange?: { startDate: Date; endDate: Date },
    _filters?: { projectIds?: string[]; sponsorAddresses?: string[]; status?: string[] }
  ): TreeInventoryRecord[] {
    const records: TreeInventoryRecord[] = [];

    for (const tree of trees) {
      if (dateRange) {
        const plantedDate = tree.plantedAt ? parseISO(tree.plantedAt) : new Date();
        if (
          plantedDate < startOfDay(dateRange.startDate) ||
          plantedDate > endOfDay(dateRange.endDate)
        )
          continue;
      }

      const plantedAt = tree.plantedAt ?? new Date().toISOString();
      const yearsSincePlanted = Math.max(
        0.1,
        (Date.now() - parseISO(plantedAt).getTime()) / (1000 * 60 * 60 * 24 * 365)
      );
      const co2PerYear =
        tree.co2OffsetKgPerYear ?? speciesMap.get(tree.species)?.co2KgPerYear ?? 48;
      const totalCo2OffsetKg = Math.round(co2PerYear * yearsSincePlanted);

      records.push({
        treeId: tree.treeId,
        projectId: tree.id,
        projectName: tree.projectName,
        registry,
        species: tree.species,
        region: tree.region,
        coordinates: {
          latitude: tree.lat,
          longitude: tree.lng,
        },
        plantedAt,
        status: tree.status,
        co2OffsetKgPerYear: co2PerYear,
        totalCo2OffsetKg,
        verificationStatus: this.getVerificationStatus(tree.status),
        sponsorAddress: tree.sponsorAddress,
        vintageYear: parseISO(plantedAt).getFullYear(),
      });
    }

    return records;
  }

  private generateVerificationAuditRecords(
    trees: ReturnType<typeof getMockTrees>,
    registry: ComplianceRegistry,
    dateRange?: { startDate: Date; endDate: Date },
    filters?: { projectIds?: string[]; sponsorAddresses?: string[]; status?: string[] }
  ): VerificationAuditRecord[] {
    const projects = new Map<string, ReturnType<typeof getMockTrees>[0]>();

    for (const tree of trees) {
      if (!projects.has(tree.projectName)) {
        projects.set(tree.projectName, tree);
      }
    }

    const auditors = [
      'SGS',
      'Bureau Veritas',
      'DNV',
      'TÜV Rheinland',
      'SCS Global Services',
      'AENOR',
      'EPIC Sustainability',
    ];
    const records: VerificationAuditRecord[] = [];

    let auditId = 1;
    for (const [projectName, tree] of projects) {
      if (filters?.projectIds && !filters.projectIds.includes(tree.id)) continue;

      const auditDate = tree.plantedAt
        ? addDays(parseISO(tree.plantedAt), 365 + Math.floor(Math.random() * 730))
        : addDays(new Date(), -Math.floor(Math.random() * 365));

      if (dateRange) {
        if (auditDate < startOfDay(dateRange.startDate) || auditDate > endOfDay(dateRange.endDate))
          continue;
      }

      const auditType = Math.random() > 0.5 ? 'validation' : 'verification';
      const status =
        Math.random() > 0.15 ? 'passed' : Math.random() > 0.5 ? 'conditional' : 'failed';

      records.push({
        auditId: `AUD-${String(auditId++).padStart(4, '0')}`,
        projectId: tree.id,
        projectName,
        registry,
        auditorName: auditors[Math.floor(Math.random() * auditors.length)],
        auditDate: auditDate.toISOString(),
        auditType,
        standard: this.getVerificationStandard(registry),
        findings: this.generateAuditFindings(auditType, status),
        nonConformities: status === 'passed' ? 0 : Math.floor(Math.random() * 3) + 1,
        status,
        nextAuditDue: status !== 'failed' ? addDays(auditDate, 365).toISOString() : undefined,
      });
    }

    return records;
  }

  private generateIssuanceReportRecords(
    trees: ReturnType<typeof getMockTrees>,
    registry: ComplianceRegistry,
    dateRange?: { startDate: Date; endDate: Date },
    _filters?: { projectIds?: string[]; sponsorAddresses?: string[]; status?: string[] }
  ): IssuanceReportRecord[] {
    const records: IssuanceReportRecord[] = [];
    let issuanceId = 1;

    for (const tree of trees) {
      if (dateRange) {
        const plantedDate = tree.plantedAt ? parseISO(tree.plantedAt) : new Date();
        if (
          plantedDate < startOfDay(dateRange.startDate) ||
          plantedDate > endOfDay(dateRange.endDate)
        )
          continue;
      }

      const vintageYear = tree.plantedAt
        ? parseISO(tree.plantedAt).getFullYear()
        : new Date().getFullYear();
      const co2PerTree = tree.co2OffsetKgPerYear ?? 48;
      const quantity = Math.max(1, Math.floor(co2PerTree / 1000));

      const serialStart = `${registry.toUpperCase()}-${vintageYear}-${String(100000 + issuanceId * 100).padStart(6, '0')}`;
      const serialEnd = `${registry.toUpperCase()}-${vintageYear}-${String(100000 + issuanceId * 100 + quantity - 1).padStart(6, '0')}`;

      records.push({
        issuanceId: `ISS-${String(issuanceId++).padStart(6, '0')}`,
        projectId: tree.id,
        projectName: tree.projectName,
        registry,
        vintageYear,
        quantityIssued: quantity,
        issuanceDate: tree.plantedAt ?? new Date().toISOString(),
        serialNumberRange: {
          start: serialStart,
          end: serialEnd,
        },
        sponsorAddress: tree.sponsorAddress,
        status: 'completed',
      });
    }

    return records;
  }

  private generateRetirementReportRecords(
    trees: ReturnType<typeof getMockTrees>,
    registry: ComplianceRegistry,
    dateRange?: { startDate: Date; endDate: Date },
    _filters?: { projectIds?: string[]; sponsorAddresses?: string[]; status?: string[] }
  ): RetirementReportRecord[] {
    const records: RetirementReportRecord[] = [];
    let retirementId = 1;

    for (const tree of trees) {
      if (tree.status !== 'verified' && Math.random() > 0.2) continue;

      if (dateRange) {
        const retirementDate = addDays(new Date(), -Math.floor(Math.random() * 365));
        if (
          retirementDate < startOfDay(dateRange.startDate) ||
          retirementDate > endOfDay(dateRange.endDate)
        )
          continue;
      }

      const vintageYear = tree.plantedAt
        ? parseISO(tree.plantedAt).getFullYear()
        : new Date().getFullYear();
      const co2PerTree = tree.co2OffsetKgPerYear ?? 48;
      const quantity = Math.max(1, Math.floor(co2PerTree / 1000));

      const serialNumbersRetired = Array.from(
        { length: quantity },
        (_, i) =>
          `${registry.toUpperCase()}-${vintageYear}-${String(100000 + retirementId * 10 + i).padStart(6, '0')}`
      );

      const retirementDate = addDays(new Date(), -Math.floor(Math.random() * 365));
      const reasons = [
        'Voluntary Corporate Offset',
        'Compliance Obligation',
        'Net Zero Commitment',
        'Carbon Neutrality Certification',
        'ESG Reporting',
      ];

      records.push({
        retirementId: `RET-${String(retirementId++).padStart(6, '0')}`,
        projectId: tree.id,
        projectName: tree.projectName,
        registry,
        vintageYear,
        quantityRetired: quantity,
        retirementDate: retirementDate.toISOString(),
        retirementReason: reasons[Math.floor(Math.random() * reasons.length)],
        beneficiary: tree.sponsorAddress,
        serialNumbersRetired,
        sponsorAddress: tree.sponsorAddress,
        status: 'completed',
      });
    }

    return records;
  }

  private mapTreeStatusToCreditStatus(status: string): CarbonCreditRecord['status'] {
    switch (status) {
      case 'verified':
        return 'issued';
      case 'planted':
      case 'funded':
        return 'pending';
      case 'completed':
        return 'retired';
      case 'failed':
        return 'cancelled';
      default:
        return 'pending';
    }
  }

  private mapProjectStatus(status: string): ProjectRegistryRecord['status'] {
    switch (status) {
      case 'verified':
        return 'verified';
      case 'planted':
        return 'issued';
      case 'funded':
        return 'validated';
      case 'completed':
        return 'completed';
      default:
        return 'registered';
    }
  }

  private getVerificationStatus(status: string): string {
    switch (status) {
      case 'verified':
        return 'Verified';
      case 'planted':
        return 'Pending Verification';
      case 'funded':
        return 'Not Verified';
      case 'completed':
        return 'Verified';
      case 'failed':
        return 'Failed Verification';
      default:
        return 'Unknown';
    }
  }

  private getVerificationStandard(registry: ComplianceRegistry): string {
    switch (registry) {
      case 'verra':
        return 'VCS';
      case 'gold-standard':
        return 'GS';
      case 'car':
        return 'CAR';
      case 'plan-vivo':
        return 'Plan Vivo';
      case 'cdm':
        return 'CDM';
      default:
        return 'Generic';
    }
  }

  private getRandomVerifier(): string {
    const verifiers = [
      'SGS',
      'Bureau Veritas',
      'DNV',
      'TÜV Rheinland',
      'SCS Global Services',
      'AENOR',
      'EPIC Sustainability',
    ];
    return verifiers[Math.floor(Math.random() * verifiers.length)];
  }

  private generateAuditFindings(auditType: string, status: string): string[] {
    const baseFindings =
      auditType === 'validation'
        ? [
            'Project design meets standard requirements',
            'Baseline scenario validated',
            'Additionality demonstrated',
          ]
        : ['Monitoring report verified', 'Emission reductions confirmed', 'Data quality assured'];

    if (status === 'conditional') {
      baseFindings.push('Minor corrective actions required', 'Documentation updates needed');
    } else if (status === 'failed') {
      baseFindings.push('Major non-conformities identified', 'Project design requires revision');
    }

    return baseFindings;
  }

  private csvEscape(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
      return '"' + value.replace(/"/g, '""') + '"';
    }
    return value;
  }

  private generateCSV(data: ComplianceRecord[], reportType: ComplianceReportType): string {
    if (data.length === 0) {
      const headers = this.getCSVHeadersForType(reportType);
      return headers.map((h) => this.csvEscape(h)).join(',') + '\n';
    }

    const firstRecord = data[0];
    const headers = this.getCSVHeaders(firstRecord, reportType);

    const rows = data.map((record) =>
      this.recordToCSVRow(record, reportType, headers).map((v) => this.csvEscape(v))
    );

    return [headers.map((h) => this.csvEscape(h)).join(','), ...rows.map((r) => r.join(','))].join('\n');
  }

  private getCSVHeadersForType(reportType: ComplianceReportType): string[] {
    const commonHeaders = ['reportType', 'registry'];

    switch (reportType) {
      case 'carbon-credits':
        return [
          ...commonHeaders,
          'creditId',
          'projectId',
          'projectName',
          'vintageYear',
          'quantityTonnes',
          'serialNumber',
          'issuanceDate',
          'retirementDate',
          'retirementReason',
          'status',
          'sponsorAddress',
          'coBenefits',
        ];
      case 'project-registry':
        return [
          ...commonHeaders,
          'projectId',
          'projectName',
          'projectType',
          'country',
          'region',
          'latitude',
          'longitude',
          'verificationStandard',
          'validationDate',
          'verificationDate',
          'verifierName',
          'totalAreaHectares',
          'estimatedAnnualCo2Tonnes',
          'status',
          'sponsorAddress',
        ];
      case 'tree-inventory':
        return [
          ...commonHeaders,
          'treeId',
          'projectId',
          'projectName',
          'species',
          'region',
          'latitude',
          'longitude',
          'plantedAt',
          'status',
          'co2OffsetKgPerYear',
          'totalCo2OffsetKg',
          'verificationStatus',
          'sponsorAddress',
          'vintageYear',
        ];
      case 'verification-audits':
        return [
          ...commonHeaders,
          'auditId',
          'projectId',
          'projectName',
          'auditorName',
          'auditDate',
          'auditType',
          'standard',
          'findings',
          'nonConformities',
          'status',
          'nextAuditDue',
        ];
      case 'issuance-report':
        return [
          ...commonHeaders,
          'issuanceId',
          'projectId',
          'projectName',
          'vintageYear',
          'quantityIssued',
          'issuanceDate',
          'serialStart',
          'serialEnd',
          'sponsorAddress',
          'status',
        ];
      case 'retirement-report':
        return [
          ...commonHeaders,
          'retirementId',
          'projectId',
          'projectName',
          'vintageYear',
          'quantityRetired',
          'retirementDate',
          'retirementReason',
          'beneficiary',
          'serialNumbersRetired',
          'sponsorAddress',
          'status',
        ];
      default:
        return commonHeaders;
    }
  }

  private getCSVHeaders(record: ComplianceRecord, reportType: ComplianceReportType): string[] {
    const commonHeaders = ['reportType', 'registry'];

    switch (reportType) {
      case 'carbon-credits':
        return [
          ...commonHeaders,
          'creditId',
          'projectId',
          'projectName',
          'vintageYear',
          'quantityTonnes',
          'serialNumber',
          'issuanceDate',
          'retirementDate',
          'retirementReason',
          'status',
          'sponsorAddress',
          'coBenefits',
        ];
      case 'project-registry':
        return [
          ...commonHeaders,
          'projectId',
          'projectName',
          'projectType',
          'country',
          'region',
          'latitude',
          'longitude',
          'verificationStandard',
          'validationDate',
          'verificationDate',
          'verifierName',
          'totalAreaHectares',
          'estimatedAnnualCo2Tonnes',
          'status',
          'sponsorAddress',
        ];
      case 'tree-inventory':
        return [
          ...commonHeaders,
          'treeId',
          'projectId',
          'projectName',
          'species',
          'region',
          'latitude',
          'longitude',
          'plantedAt',
          'status',
          'co2OffsetKgPerYear',
          'totalCo2OffsetKg',
          'verificationStatus',
          'sponsorAddress',
          'vintageYear',
        ];
      case 'verification-audits':
        return [
          ...commonHeaders,
          'auditId',
          'projectId',
          'projectName',
          'auditorName',
          'auditDate',
          'auditType',
          'standard',
          'findings',
          'nonConformities',
          'status',
          'nextAuditDue',
        ];
      case 'issuance-report':
        return [
          ...commonHeaders,
          'issuanceId',
          'projectId',
          'projectName',
          'vintageYear',
          'quantityIssued',
          'issuanceDate',
          'serialStart',
          'serialEnd',
          'sponsorAddress',
          'status',
        ];
      case 'retirement-report':
        return [
          ...commonHeaders,
          'retirementId',
          'projectId',
          'projectName',
          'vintageYear',
          'quantityRetired',
          'retirementDate',
          'retirementReason',
          'beneficiary',
          'serialNumbersRetired',
          'sponsorAddress',
          'status',
        ];
      default:
        return Object.keys(record);
    }
  }

  private recordToCSVRow(
    record: ComplianceRecord,
    reportType: ComplianceReportType,
    _headers: string[]
  ): string[] {
    const getRegistry = (r: ComplianceRecord): string => {
      if ('registry' in r && typeof (r as Record<string, unknown>).registry === 'string') {
        return (r as Record<string, unknown>).registry as string;
      }
      return 'generic';
    };

    const commonValues = [reportType, getRegistry(record)];

    switch (reportType) {
      case 'carbon-credits': {
        const r = record as CarbonCreditRecord;
        return [
          ...commonValues,
          r.creditId,
          r.projectId,
          r.projectName,
          String(r.vintageYear),
          String(r.quantityTonnes),
          r.serialNumber ?? '',
          r.issuanceDate,
          r.retirementDate ?? '',
          r.retirementReason ?? '',
          r.status,
          r.sponsorAddress ?? '',
          r.coBenefits?.join(';') ?? '',
        ];
      }
      case 'project-registry': {
        const r = record as ProjectRegistryRecord;
        return [
          ...commonValues,
          r.projectId,
          r.projectName,
          r.projectType,
          r.location.country,
          r.location.region,
          String(r.location.coordinates.latitude),
          String(r.location.coordinates.longitude),
          r.verificationStandard,
          r.validationDate,
          r.verificationDate ?? '',
          r.verifierName ?? '',
          String(r.totalAreaHectares),
          String(r.estimatedAnnualCo2Tonnes),
          r.status,
          r.sponsorAddress ?? '',
        ];
      }
      case 'tree-inventory': {
        const r = record as TreeInventoryRecord;
        return [
          ...commonValues,
          r.treeId,
          r.projectId,
          r.projectName,
          r.registry,
          r.species,
          r.region,
          String(r.coordinates.latitude),
          String(r.coordinates.longitude),
          r.plantedAt,
          r.status,
          String(r.co2OffsetKgPerYear),
          String(r.totalCo2OffsetKg),
          r.verificationStatus,
          r.sponsorAddress ?? '',
          String(r.vintageYear),
        ];
      }
      case 'verification-audits': {
        const r = record as VerificationAuditRecord;
        return [
          ...commonValues,
          r.auditId,
          r.projectId,
          r.projectName,
          r.registry,
          r.auditorName,
          r.auditDate,
          r.auditType,
          r.standard,
          r.findings.join('; '),
          String(r.nonConformities),
          r.status,
          r.nextAuditDue ?? '',
        ];
      }
      case 'issuance-report': {
        const r = record as IssuanceReportRecord;
        return [
          ...commonValues,
          r.issuanceId,
          r.projectId,
          r.projectName,
          String(r.vintageYear),
          String(r.quantityIssued),
          r.issuanceDate,
          r.serialNumberRange.start,
          r.serialNumberRange.end,
          r.sponsorAddress ?? '',
          r.status,
        ];
      }
      case 'retirement-report': {
        const r = record as RetirementReportRecord;
        return [
          ...commonValues,
          r.retirementId,
          r.projectId,
          r.projectName,
          String(r.vintageYear),
          String(r.quantityRetired),
          r.retirementDate,
          r.retirementReason,
          r.beneficiary ?? '',
          r.serialNumbersRetired.join('; '),
          r.sponsorAddress ?? '',
          r.status,
        ];
      }
      default:
        return Object.values(record).map((v) =>
          Array.isArray(v) ? v.join('; ') : String(v ?? '')
        );
    }
  }

  private generateJSON(data: ComplianceRecord[], metadata: ComplianceReportMetadata): string {
    const output = {
      metadata,
      records: data.map((record) => ({
        ...record,
        _recordType: this.getRecordType(record),
      })),
    };
    return JSON.stringify(output, null, 2);
  }

  private getRecordType(record: ComplianceRecord): string {
    if ('creditId' in record) return 'carbon-credit';
    if ('projectName' in record && 'verificationStandard' in record) return 'project-registry';
    if ('treeId' in record) return 'tree-inventory';
    if ('auditId' in record) return 'verification-audits';
    if ('issuanceId' in record) return 'issuance-report';
    if ('retirementId' in record) return 'retirement-report';
    return 'unknown';
  }

  private buildMetadata(
    reportId: string,
    reportType: ComplianceReportType,
    format: ComplianceReportFormat,
    registry: ComplianceRegistry,
    totalRecords: number,
    dateRange?: { startDate: Date; endDate: Date },
    filters?: Record<string, unknown>,
    startTime: number = Date.now()
  ): ComplianceReportMetadata {
    return {
      reportId,
      generatedAt: new Date().toISOString(),
      generatedBy: 'stellar-app-os-compliance-generator',
      format,
      registry,
      reportType,
      dateRange: dateRange
        ? {
            start: dateRange.startDate.toISOString(),
            end: dateRange.endDate.toISOString(),
          }
        : {
            start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
            end: new Date().toISOString(),
          },
      filters,
      totalRecords,
      schemaVersion: '1.0.0',
      generationTimeMs: Date.now() - startTime,
    };
  }

  async runScheduledExport(): Promise<ExportJobResult> {
    if (this.isRunning) {
      throw new Error('Export job already running');
    }

    this.isRunning = true;
    const jobId = `export-job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const startedAt = new Date().toISOString();

    const jobResult: ExportJobResult = {
      jobId,
      status: 'running',
      startedAt,
    };

    this.jobHistory.push(jobResult);

    try {
      const endDate = new Date();
      const startDate = subDays(endDate, 30);

      const response = await this.generateReport(
        this.config.reportType,
        this.config.format,
        this.config.registry,
        { startDate, endDate }
      );

      const fileName = `compliance-${this.config.reportType}-${this.config.registry}-${format(startDate, 'yyyy-MM-dd')}-to-${format(endDate, 'yyyy-MM-dd')}.${this.config.format}`;
      const filePath = `${this.config.outputPath}/${fileName}`;

      const content = this.config.format === 'csv' ? response.csvContent : response.jsonContent;

      if (!content) {
        throw new Error('Failed to generate report content');
      }

      await this.saveToFile(filePath, content);

      jobResult.status = 'completed';
      jobResult.completedAt = new Date().toISOString();
      jobResult.reportId = response.metadata.reportId;
      jobResult.filePath = filePath;
      jobResult.recordsExported = response.metadata.totalRecords;

      logger.info('Scheduled export completed', {
        jobId,
        filePath,
        recordsExported: jobResult.recordsExported,
      });

      if (this.config.webhookUrl) {
        await this.sendWebhook(jobResult);
      }

      if (this.config.emailRecipients.length > 0) {
        await this.sendEmailNotification(jobResult);
      }

      await this.cleanupOldExports();

      return jobResult;
    } catch (error) {
      jobResult.status = 'failed';
      jobResult.completedAt = new Date().toISOString();
      jobResult.error = error instanceof Error ? error.message : 'Unknown error';

      logger.error('Scheduled export failed', { jobId, error: jobResult.error });

      if (this.config.webhookUrl) {
        await this.sendWebhook(jobResult);
      }

      return jobResult;
    } finally {
      this.isRunning = false;
    }
  }

  private async saveToFile(filePath: string, content: string): Promise<void> {
    const fs = await import('fs/promises');
    const path = await import('path');

    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(filePath, content, 'utf-8');
  }

  private async sendWebhook(jobResult: ExportJobResult): Promise<void> {
    if (!this.config.webhookUrl) return;
    try {
      const response = await fetch(this.config.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(jobResult),
      });

      if (!response.ok) {
        logger.warn('Webhook delivery failed', { status: response.status });
      }
    } catch (error) {
      logger.error('Webhook error', { error });
    }
  }

  private sendEmailNotification(jobResult: ExportJobResult): void {
    logger.info('Email notification would be sent', {
      recipients: this.config.emailRecipients,
      jobResult,
    });
  }

  private async cleanupOldExports(): Promise<void> {
    const fs = await import('fs/promises');
    const path = await import('path');

    try {
      const files = await fs.readdir(this.config.outputPath);
      const cutoff = Date.now() - this.config.retentionDays * 24 * 60 * 60 * 1000;

      for (const file of files) {
        const filePath = path.join(this.config.outputPath, file);
        const stats = await fs.stat(filePath);
        if (stats.mtimeMs < cutoff) {
          await fs.unlink(filePath);
          logger.info('Deleted old export file', { filePath });
        }
      }
    } catch (error) {
      logger.warn('Cleanup failed', { error });
    }
  }

  getJobHistory(): ExportJobResult[] {
    return [...this.jobHistory];
  }

  getConfig(): ScheduledExportConfig {
    return { ...this.config };
  }

  updateConfig(config: Partial<ScheduledExportConfig>): void {
    this.config = { ...this.config, ...config };
  }

  isJobRunning(): boolean {
    return this.isRunning;
  }
}
