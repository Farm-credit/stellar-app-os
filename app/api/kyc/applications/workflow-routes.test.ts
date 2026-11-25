import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';
import { screenCertificationEligibility } from '@/lib/kyc/eligibility';
import type { KycApplicationRecord } from '@/lib/kyc/types';
import { evaluateKycWorkflow } from '@/lib/kyc/workflow';

const mockService = {
  getWorkflowSummary: vi.fn(),
  startReview: vi.fn(),
  rescreenApplication: vi.fn(),
  expireApplication: vi.fn(),
  onChainStatusFor: vi.fn(),
};

vi.mock('@/lib/kyc/service', () => ({
  getKycService: () => mockService,
}));

import { GET as getWorkflow } from './[id]/workflow/route';
import { POST as postReview } from './[id]/review/route';

function makeApplication(overrides: Partial<KycApplicationRecord> = {}): KycApplicationRecord {
  const screening = screenCertificationEligibility({
    farmerAddress: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
    identity: {
      fullName: 'Amina Yusuf',
      nationalId: '12345678901',
      phoneNumber: '+2348012345678',
      village: 'Dawakin Kudu',
      dateOfBirth: '1990-04-12',
      documentType: 'nin',
      verifiedAt: '2026-09-20T09:00:00Z',
    },
    land: {
      ownershipType: 'title_deed',
      documentReference: 'DEED-1',
      plotSizeHectares: 2.5,
      gpsCoordinates: { latitude: 11.98, longitude: 8.55 },
      region: 'Kano',
      verifiedAt: '2026-09-21T09:00:00Z',
    },
    experience: {
      yearsOfExperience: 5,
      primaryCrop: 'Maize',
      secondaryCrops: ['Cowpea'],
      soilType: 'loamy',
      trainingProgrammes: ['FMARD 2024'],
    },
    certification: {
      jurisdictionFlags: 0b111,
      requiredJurisdictionFlags: 0b101,
      activeSanctions: [],
    },
    consentGranted: true,
  });

  return {
    id: 'kyc-1',
    farmerAddress: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
    fullName: 'Amina Yusuf',
    nationalIdHash: 'hash-1',
    phoneNumber: '+2348012345678',
    village: 'Dawakin Kudu',
    dateOfBirth: '1990-04-12',
    documentType: 'nin',
    documentReferenceHash: 'doc-hash-1',
    identityVerifiedAt: '2026-09-20T09:00:00Z',
    ownershipType: 'title_deed',
    plotSizeHectares: 2.5,
    gpsCoordinates: { latitude: 11.98, longitude: 8.55 },
    region: 'Kano',
    landVerifiedAt: '2026-09-21T09:00:00Z',
    yearsOfExperience: 5,
    primaryCrop: 'Maize',
    secondaryCrops: ['Cowpea'],
    soilType: 'loamy',
    trainingProgrammes: ['FMARD 2024'],
    jurisdictionFlags: 0b111,
    requiredJurisdictionFlags: 0b101,
    activeSanctions: [],
    consentGranted: true,
    status: 'under_review',
    screening,
    decision: null,
    submittedAt: '2026-09-19T00:00:00.000Z',
    updatedAt: '2026-09-21T09:00:00.000Z',
    ...overrides,
  };
}

describe('Farmer KYC workflow API routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('GET /api/kyc/applications/[id]/workflow returns 4-stage workflow summary', async () => {
    const application = makeApplication();
    const workflow = evaluateKycWorkflow(application);
    mockService.getWorkflowSummary.mockResolvedValue({ application, workflow });
    mockService.onChainStatusFor.mockReturnValue('pending');

    const response = await getWorkflow({} as NextRequest, {
      params: Promise.resolve({ id: 'kyc-1' }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.workflow.completedStages).toBe(4);
    expect(data.workflow.readyForApproval).toBe(true);
    expect(data.onChainStatus).toBe('pending');
  });

  it('GET /api/kyc/applications/[id]/workflow returns 404 when application does not exist', async () => {
    mockService.getWorkflowSummary.mockResolvedValue(null);

    const response = await getWorkflow({} as NextRequest, {
      params: Promise.resolve({ id: 'missing-id' }),
    });

    expect(response.status).toBe(404);
  });

  it('POST /api/kyc/applications/[id]/review starts review and returns workflow', async () => {
    const application = makeApplication({ status: 'under_review' });
    mockService.startReview.mockResolvedValue({ ok: true, application });
    mockService.onChainStatusFor.mockReturnValue('pending');

    const request = new Request('http://localhost/api/kyc/applications/kyc-1/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'start_review' }),
    }) as NextRequest;

    const response = await postReview(request, { params: Promise.resolve({ id: 'kyc-1' }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.application.status).toBe('under_review');
    expect(data.workflow.stages).toHaveLength(4);
  });

  it('POST /api/kyc/applications/[id]/review validates action and handles conflict', async () => {
    const badReq = new Request('http://localhost/api/kyc/applications/kyc-1/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'invalid_action' }),
    }) as NextRequest;
    const badRes = await postReview(badReq, { params: Promise.resolve({ id: 'kyc-1' }) });
    expect(badRes.status).toBe(400);

    mockService.expireApplication.mockResolvedValue({
      ok: false,
      error: 'Cannot expire application kyc-1 in status "rejected"',
    });
    const conflictReq = new Request('http://localhost/api/kyc/applications/kyc-1/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'expire', reason: 'Stale' }),
    }) as NextRequest;
    const conflictRes = await postReview(conflictReq, { params: Promise.resolve({ id: 'kyc-1' }) });
    expect(conflictRes.status).toBe(409);
  });
});
