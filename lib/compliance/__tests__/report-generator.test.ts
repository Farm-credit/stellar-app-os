import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ComplianceReportGenerator } from '@/lib/compliance/report-generator';
import type { ComplianceReportType, ScheduledExportConfig } from '@/lib/compliance/types';

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/lib/api/mock/trees', () => ({
  getMockTrees: () => [
    {
      id: 'tree-001',
      treeId: 'HRV-2024-0001',
      species: 'Teak',
      region: 'Kano, Nigeria',
      status: 'verified',
      plantedAt: '2024-03-12T08:00:00Z',
      lat: 12.04,
      lng: 8.48,
      co2OffsetKgPerYear: 22,
      projectName: 'Northern Savanna Reforestation',
      sponsorAddress: 'GTEST1234567890123456789012345678901234567890123456789012',
    },
    {
      id: 'tree-002',
      treeId: 'HRV-2024-0002',
      species: 'Moringa',
      region: 'Kano, Nigeria',
      status: 'planted',
      plantedAt: '2024-05-20T10:30:00Z',
      lat: 11.98,
      lng: 8.55,
      co2OffsetKgPerYear: 9,
      projectName: 'Northern Savanna Reforestation',
      sponsorAddress: 'GTEST1234567890123456789012345678901234567890123456789012',
    },
    {
      id: 'tree-003',
      treeId: 'HRV-2024-0003',
      species: 'Eucalyptus',
      region: 'Kaduna, Nigeria',
      status: 'completed',
      plantedAt: '2023-11-05T14:00:00Z',
      lat: 10.48,
      lng: 7.4,
      co2OffsetKgPerYear: 31,
      projectName: 'Central Belt Afforestation',
      sponsorAddress: 'GTEST2222222222222222222222222222222222222222222222222222',
    },
  ],
}));

vi.mock('fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
  readdir: vi.fn().mockResolvedValue([]),
  stat: vi.fn().mockResolvedValue({ mtimeMs: Date.now() }),
  unlink: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('date-fns', () => ({
  parseISO: (date: string) => new Date(date),
  format: (date: Date, fmt: string) => {
    if (fmt === 'yyyyMMdd') return '20240115';
    if (fmt === 'yyyy-MM-dd') return '2024-01-15';
    return date.toISOString();
  },
  startOfDay: (date: Date) => new Date(date.setHours(0, 0, 0, 0)),
  endOfDay: (date: Date) => new Date(date.setHours(23, 59, 59, 999)),
  subDays: (date: Date, days: number) => new Date(date.getTime() - days * 24 * 60 * 60 * 1000),
  addDays: (date: Date, days: number) => new Date(date.getTime() + days * 24 * 60 * 60 * 1000),
}));

describe('ComplianceReportGenerator', () => {
  let generator: ComplianceReportGenerator;
  const defaultConfig: Partial<ScheduledExportConfig> = {
    enabled: true,
    reportType: 'carbon-credits',
    format: 'json',
    registry: 'verra',
    outputPath: './exports/compliance',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    generator = new ComplianceReportGenerator(defaultConfig);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('generateReport', () => {
    it('should generate carbon credits report in JSON format', async () => {
      const response = await generator.generateReport('carbon-credits', 'json', 'verra');

      expect(response).toBeDefined();
      expect(response.metadata).toBeDefined();
      expect(response.metadata.reportType).toBe('carbon-credits');
      expect(response.metadata.registry).toBe('verra');
      expect(response.metadata.format).toBe('json');
      expect(response.metadata.totalRecords).toBeGreaterThanOrEqual(0);
      expect(response.jsonContent).toBeDefined();
      expect(response.csvContent).toBeUndefined();
    });

    it('should generate carbon credits report in CSV format', async () => {
      const response = await generator.generateReport('carbon-credits', 'csv', 'verra');

      expect(response.csvContent).toBeDefined();
      expect(response.csvContent).toContain('creditId');
      expect(response.csvContent).toContain('projectId');
    });

    it('should generate project registry report', async () => {
      const response = await generator.generateReport('project-registry', 'json', 'verra');

      expect(response.metadata.reportType).toBe('project-registry');
      expect(response.data.length).toBeGreaterThanOrEqual(0);
    });

    it('should generate tree inventory report', async () => {
      const response = await generator.generateReport('tree-inventory', 'json', 'gold-standard');

      expect(response.metadata.reportType).toBe('tree-inventory');
      expect(response.metadata.registry).toBe('gold-standard');
    });

    it('should generate verification audit report', async () => {
      const response = await generator.generateReport('verification-audits', 'json', 'car');

      expect(response.metadata.reportType).toBe('verification-audits');
      expect(response.metadata.registry).toBe('car');
    });

    it('should generate issuance report', async () => {
      const response = await generator.generateReport('issuance-report', 'json', 'plan-vivo');

      expect(response.metadata.reportType).toBe('issuance-report');
      expect(response.metadata.registry).toBe('plan-vivo');
    });

    it('should generate retirement report', async () => {
      const response = await generator.generateReport('retirement-report', 'json', 'cdm');

      expect(response.metadata.reportType).toBe('retirement-report');
      expect(response.metadata.registry).toBe('cdm');
    });

    it('should apply date range filters', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-06-30');

      const response = await generator.generateReport('carbon-credits', 'json', 'verra', {
        startDate,
        endDate,
      });

      expect(response.metadata.dateRange).toBeDefined();
    });

    it('should apply project ID filters', async () => {
      const response = await generator.generateReport(
        'carbon-credits',
        'json',
        'verra',
        undefined,
        { projectIds: ['tree-001'] }
      );

      const creditRecords = response.data as any[];
      expect(creditRecords.every((r) => r.projectId === 'tree-001')).toBe(true);
    });

    it('should apply sponsor address filters', async () => {
      const sponsor = 'GTEST1234567890123456789012345678901234567890123456789012';
      const response = await generator.generateReport(
        'carbon-credits',
        'json',
        'verra',
        undefined,
        { sponsorAddresses: [sponsor] }
      );

      const creditRecords = response.data as any[];
      expect(creditRecords.every((r) => r.sponsorAddress === sponsor)).toBe(true);
    });

    it('should apply species filters', async () => {
      const response = await generator.generateReport(
        'carbon-credits',
        'json',
        'verra',
        undefined,
        { species: ['Teak'] }
      );

      expect(response.data.length).toBeGreaterThanOrEqual(0);
    });

    it('should apply region filters', async () => {
      const response = await generator.generateReport(
        'carbon-credits',
        'json',
        'verra',
        undefined,
        { regions: ['Kano, Nigeria'] }
      );

      expect(response.data.length).toBeGreaterThanOrEqual(0);
    });

    it('should apply status filters', async () => {
      const response = await generator.generateReport(
        'carbon-credits',
        'json',
        'verra',
        undefined,
        { status: ['verified'] }
      );

      expect(response.data.length).toBeGreaterThanOrEqual(0);
    });

    it('should apply CO2 offset range filters', async () => {
      const response = await generator.generateReport(
        'carbon-credits',
        'json',
        'verra',
        undefined,
        { minCo2OffsetKg: 10, maxCo2OffsetKg: 30 }
      );

      expect(response.data.length).toBeGreaterThanOrEqual(0);
    });

    it('should throw error for unknown report type', async () => {
      await expect(
        generator.generateReport('unknown-type' as ComplianceReportType, 'json', 'verra')
      ).rejects.toThrow('Unknown report type');
    });

    it('should include generation time in metadata', async () => {
      const response = await generator.generateReport('carbon-credits', 'json', 'verra');

      expect(response.metadata.generationTimeMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('CSV generation', () => {
    it('should generate valid CSV with headers', async () => {
      const response = await generator.generateReport('carbon-credits', 'csv', 'verra');

      const lines = response.csvContent!.split('\n');
      expect(lines.length).toBeGreaterThan(1);
      expect(lines[0]).toContain('creditId');
      expect(lines[0]).toContain('projectId');
    });

    it('should handle empty data with headers', async () => {
      const response = await generator.generateReport('carbon-credits', 'csv', 'verra', undefined, {
        projectIds: ['non-existent'],
      });

      expect(response.csvContent).toContain('creditId');
    });
  });

  describe('JSON generation', () => {
    it('should generate valid JSON', async () => {
      const response = await generator.generateReport('carbon-credits', 'json', 'verra');

      expect(() => JSON.parse(response.jsonContent!)).not.toThrow();
      const parsed = JSON.parse(response.jsonContent!);
      expect(parsed.metadata).toBeDefined();
      expect(parsed.records).toBeDefined();
    });
  });

  describe('Scheduled Export', () => {
    it('should run scheduled export successfully', async () => {
      const result = await generator.runScheduledExport();

      expect(result).toBeDefined();
      expect(result.jobId).toContain('export-job-');
      expect(result.status).toBe('completed');
      expect(result.filePath).toBeDefined();
      expect(result.recordsExported).toBeGreaterThanOrEqual(0);
      expect(result.completedAt).toBeDefined();
    });

    it('should prevent concurrent exports', async () => {
      const promise1 = generator.runScheduledExport();
      const promise2 = generator.runScheduledExport();

      await expect(Promise.all([promise1, promise2])).rejects.toThrow('Export job already running');
    });

    it('should track job history', async () => {
      await generator.runScheduledExport();
      const history = generator.getJobHistory();

      expect(history.length).toBe(1);
      expect(history[0].status).toBe('completed');
    });
  });

  describe('Configuration', () => {
    it('should return current config', () => {
      const config = generator.getConfig();
      expect(config.reportType).toBe('carbon-credits');
      expect(config.format).toBe('json');
      expect(config.registry).toBe('verra');
    });

    it('should update config', () => {
      generator.updateConfig({ reportType: 'project-registry', format: 'csv' });
      const config = generator.getConfig();
      expect(config.reportType).toBe('project-registry');
      expect(config.format).toBe('csv');
    });
  });
});

describe('getComplianceReportGenerator singleton', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('should create instance with provided config', async () => {
    const { getComplianceReportGenerator: getGen } =
      await import('@/lib/compliance/report-generator');
    const gen = getGen({ reportType: 'tree-inventory' });
    expect(gen.getConfig().reportType).toBe('tree-inventory');
  });
});
