// Copyright 2024 Farm-credit Contributors
// Licensed under the Apache License, Version 2.0

/**
 * Land Plot Audit API route tests.
 *
 * The backend service is mocked so these tests exercise the HTTP contract
 * (validation, success, error mapping) without touching Copernicus.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

import { auditLandPlot, type LandPlotAuditResult } from '@/backend/src/services/satelliteVerification';
import { POST, GET } from './route';

vi.mock('@/backend/src/services/satelliteVerification', () => ({
  auditLandPlot: vi.fn(),
}));

const auditMock = vi.mocked(auditLandPlot);

const URL = 'http://localhost:3000/api/satellite/audit';

function postRequest(body: unknown): NextRequest {
  return new NextRequest(URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const VALID_BODY = {
  plotId: 'plot-001',
  plotAreaHectares: 2.5,
  bounds: { north: 7.4, south: 7.3, east: 5.2, west: 5.1 },
  claimedStatus: 'planted',
  claimedAt: '2025-01-15',
};

const FAKE_RESULT = {
  plotId: 'plot-001',
  verdict: 'confirmed',
  claim: VALID_BODY,
  evidence: { meanNdvi: 0.6, sampleCount: 500, imageDate: '2025-01-20', source: 'copernicus-sentinel-2' },
  expectedNdviRange: { min: 0.2, max: 1 },
  confidenceScore: 100,
  reasoning: ['Claim: plot "plot-001" reported as "planted".'],
  auditDate: '2025-01-21T00:00:00.000Z',
  dataSource: 'copernicus-sentinel-2',
} as unknown as LandPlotAuditResult;

describe('POST /api/satellite/audit', () => {
  beforeEach(() => {
    auditMock.mockReset();
  });

  it('returns the audit result on a valid request', async () => {
    auditMock.mockResolvedValueOnce(FAKE_RESULT);

    const res = await POST(postRequest(VALID_BODY));
    expect(res.status).toBe(200);

    const data = (await res.json()) as { success: boolean; data: LandPlotAuditResult };
    expect(data.success).toBe(true);
    expect(data.data.verdict).toBe('confirmed');
    expect(auditMock).toHaveBeenCalledTimes(1);
    expect(auditMock).toHaveBeenCalledWith(
      expect.objectContaining({ plotId: 'plot-001', claimedStatus: 'planted' }),
      expect.any(Object)
    );
  });

  it('rejects invalid JSON with 400', async () => {
    const res = await POST(
      new NextRequest(URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{not json',
      })
    );
    expect(res.status).toBe(400);
  });

  it('rejects missing required fields with 422', async () => {
    const res = await POST(postRequest({ claimedStatus: 'planted', claimedAt: '2025-01-15' }));
    expect(res.status).toBe(422);
    const data = (await res.json()) as { validationErrors: Array<{ field: string }> };
    expect(data.validationErrors.some((e) => e.field === 'plotId')).toBe(true);
    expect(data.validationErrors.some((e) => e.field === 'plotAreaHectares')).toBe(true);
    expect(data.validationErrors.some((e) => e.field === 'bounds')).toBe(true);
    expect(auditMock).not.toHaveBeenCalled();
  });

  it('rejects an invalid claimedStatus with 422', async () => {
    const res = await POST(postRequest({ ...VALID_BODY, claimedStatus: 'flourishing' }));
    expect(res.status).toBe(422);
    const data = (await res.json()) as { validationErrors: Array<{ field: string }> };
    expect(data.validationErrors.some((e) => e.field === 'claimedStatus')).toBe(true);
  });

  it('rejects coordinates out of range with 422', async () => {
    const res = await POST(
      postRequest({
        ...VALID_BODY,
        bounds: undefined,
        coordinates: { latitude: 999, longitude: 5.1 },
      })
    );
    expect(res.status).toBe(422);
    const data = (await res.json()) as { validationErrors: Array<{ field: string }> };
    expect(data.validationErrors.some((e) => e.field === 'coordinates.latitude')).toBe(true);
  });

  it('maps a service validation error to 422', async () => {
    auditMock.mockRejectedValueOnce(new Error('Invalid land plot audit claim: plotId (plotId is required.)'));
    const res = await POST(postRequest(VALID_BODY));
    expect(res.status).toBe(422);
  });

  it('maps an unexpected service error to 500', async () => {
    auditMock.mockRejectedValueOnce(new Error('unexpected boom'));
    const res = await POST(postRequest(VALID_BODY));
    expect(res.status).toBe(500);
  });
});

describe('GET /api/satellite/audit', () => {
  it('returns 405 Method Not Allowed', async () => {
    const res = await GET();
    expect(res.status).toBe(405);
  });
});
