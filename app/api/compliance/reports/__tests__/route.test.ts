import { vi, describe, it, expect, beforeEach } from 'vitest';
import { GET, POST } from '@/app/api/compliance/reports/route';

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const mockGenerateReport = vi.fn();

vi.mock('@/lib/compliance/report-generator', () => ({
  getComplianceReportGenerator: () => ({
    generateReport: mockGenerateReport,
  }),
}));

const mockMetadata = {
  reportId: 'test-report-id',
  reportType: 'carbon-credits',
  format: 'json',
  registry: 'verra',
  generatedAt: new Date().toISOString(),
  generatedBy: 'stellar-app-os-compliance-generator',
  version: '1.0.0',
  recordCount: 3,
  filters: undefined,
  generationTimeMs: 10,
};

const mockData = [
  {
    creditId: 'CC-VERRA-2024-1000001',
    projectId: 'tree-001',
    projectName: 'Northern Savanna Reforestation',
    registry: 'verra',
    vintageYear: 2024,
    quantityTonnes: 1,
    serialNumber: 'VERRA-2024-1000001',
    issuanceDate: '2024-03-12T08:00:00Z',
    status: 'issued',
    sponsorAddress: 'GTEST1234567890123456789012345678901234567890123456789012',
    coBenefits: ['Biodiversity', 'Community Development'],
  },
];

const mockResponse = {
  metadata: mockMetadata,
  data: mockData,
  jsonContent: JSON.stringify({ metadata: mockMetadata, records: mockData }, null, 2),
  csvContent:
    'creditId,projectId,projectName,registry,vintageYear,quantityTonnes,serialNumber,issuanceDate,status,sponsorAddress,coBenefits\nCC-VERRA-2024-1000001,tree-001,Northern Savanna Reforestation,verra,2024,1,VERRA-2024-1000001,2024-03-12T08:00:00Z,issued,GTEST1234567890123456789012345678901234567890123456789012,"Biodiversity; Community Development"',
};

function createNextRequest(searchParams: Record<string, string> = {}) {
  const url = new URL('http://localhost:3000/api/compliance/reports');
  Object.entries(searchParams).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });
  return {
    nextUrl: url,
    method: 'GET',
    headers: new Headers(),
  } as any;
}

function createNextPostRequest(body: Record<string, unknown> = {}) {
  return {
    nextUrl: new URL('http://localhost:3000/api/compliance/reports'),
    method: 'POST',
    headers: new Headers({ 'Content-Type': 'application/json' }),
    json: () => body,
    text: () => JSON.stringify(body),
  } as any;
}

describe('GET /api/compliance/reports', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerateReport.mockResolvedValue(mockResponse);
  });

  it('should return JSON report by default', async () => {
    const request = createNextRequest({ type: 'carbon-credits' });
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.metadata).toBeDefined();
    expect(data.metadata.reportType).toBe('carbon-credits');
    expect(data.records).toBeDefined();
  });

  it('should return CSV when format=csv', async () => {
    const request = createNextRequest({ type: 'carbon-credits', format: 'csv' });
    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/csv');
    expect(response.headers.get('Content-Disposition')).toContain('.csv');
  });

  it('should return JSON when format=json', async () => {
    const request = createNextRequest({ type: 'project-registry', format: 'json' });
    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('application/json');
  });

  it('should handle project-registry report type', async () => {
    const request = createNextRequest({ type: 'project-registry' });
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.metadata.reportType).toBe('carbon-credits');
  });

  it('should handle tree-inventory report type', async () => {
    const request = createNextRequest({ type: 'tree-inventory' });
    const response = await GET(request);

    expect(response.status).toBe(200);
  });

  it('should handle verification-audit report type', async () => {
    const request = createNextRequest({ type: 'verification-audit' });
    const response = await GET(request);

    expect(response.status).toBe(200);
  });

  it('should handle issuance-report report type', async () => {
    const request = createNextRequest({ type: 'issuance-report' });
    const response = await GET(request);

    expect(response.status).toBe(200);
  });

  it('should handle retirement-report report type', async () => {
    const request = createNextRequest({ type: 'retirement-report' });
    const response = await GET(request);

    expect(response.status).toBe(200);
  });

  it('should handle gold-standard registry', async () => {
    const request = createNextRequest({ registry: 'gold-standard' });
    const response = await GET(request);

    expect(response.status).toBe(200);
  });

  it('should handle car registry', async () => {
    const request = createNextRequest({ registry: 'car' });
    const response = await GET(request);

    expect(response.status).toBe(200);
  });

  it('should handle plan-vivo registry', async () => {
    const request = createNextRequest({ registry: 'plan-vivo' });
    const response = await GET(request);

    expect(response.status).toBe(200);
  });

  it('should handle cdm registry', async () => {
    const request = createNextRequest({ registry: 'cdm' });
    const response = await GET(request);

    expect(response.status).toBe(200);
  });

  it('should handle generic registry', async () => {
    const request = createNextRequest({ registry: 'generic' });
    const response = await GET(request);

    expect(response.status).toBe(200);
  });

  it('should apply projectIds filter', async () => {
    const request = createNextRequest({
      type: 'carbon-credits',
      projectIds: 'tree-001,tree-002',
    });
    const response = await GET(request);

    expect(response.status).toBe(200);
  });

  it('should apply sponsorAddresses filter', async () => {
    const request = createNextRequest({
      type: 'carbon-credits',
      sponsorAddresses: 'GTEST1234567890123456789012345678901234567890123456789012',
    });
    const response = await GET(request);

    expect(response.status).toBe(200);
  });

  it('should apply species filter', async () => {
    const request = createNextRequest({
      type: 'carbon-credits',
      species: 'Teak,Moringa',
    });
    const response = await GET(request);

    expect(response.status).toBe(200);
  });

  it('should apply regions filter', async () => {
    const request = createNextRequest({
      type: 'carbon-credits',
      regions: 'Kano, Nigeria',
    });
    const response = await GET(request);

    expect(response.status).toBe(200);
  });

  it('should apply status filter', async () => {
    const request = createNextRequest({
      type: 'carbon-credits',
      status: 'verified,planted',
    });
    const response = await GET(request);

    expect(response.status).toBe(200);
  });

  it('should apply minCo2OffsetKg filter', async () => {
    const request = createNextRequest({
      type: 'carbon-credits',
      minCo2OffsetKg: '10',
    });
    const response = await GET(request);

    expect(response.status).toBe(200);
  });

  it('should apply maxCo2OffsetKg filter', async () => {
    const request = createNextRequest({
      type: 'carbon-credits',
      maxCo2OffsetKg: '30',
    });
    const response = await GET(request);

    expect(response.status).toBe(200);
  });

  it('should apply date range filters', async () => {
    const request = createNextRequest({
      type: 'carbon-credits',
      startDate: '2024-01-01',
      endDate: '2024-12-31',
    });
    const response = await GET(request);

    expect(response.status).toBe(200);
  });

  it('should return 500 on generator error', async () => {
    mockGenerateReport.mockRejectedValueOnce(new Error('Generator error'));

    const request = createNextRequest({ type: 'carbon-credits' });
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Generator error');
  });
});

describe('POST /api/compliance/reports', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerateReport.mockResolvedValue(mockResponse);
  });

  it('should generate report from POST body', async () => {
    const request = createNextPostRequest({
      type: 'carbon-credits',
      format: 'json',
      registry: 'verra',
    });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.metadata).toBeDefined();
  });

  it('should use defaults when not provided', async () => {
    const request = createNextPostRequest({});
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.metadata).toBeDefined();
  });

  it('should return CSV when format=csv in body', async () => {
    const request = createNextPostRequest({
      type: 'carbon-credits',
      format: 'csv',
      registry: 'verra',
    });
    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/csv');
  });

  it('should apply filters from body', async () => {
    const request = createNextPostRequest({
      type: 'carbon-credits',
      filters: {
        projectIds: ['tree-001'],
        status: ['verified'],
      },
    });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.metadata).toBeDefined();
  });

  it('should apply date range from body', async () => {
    const request = createNextPostRequest({
      type: 'carbon-credits',
      startDate: '2024-01-01',
      endDate: '2024-12-31',
    });
    const response = await POST(request);

    expect(response.status).toBe(200);
  });

  it('should return 500 on error', async () => {
    mockGenerateReport.mockRejectedValueOnce(new Error('POST error'));

    const request = createNextPostRequest({ type: 'carbon-credits' });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('POST error');
  });
});
