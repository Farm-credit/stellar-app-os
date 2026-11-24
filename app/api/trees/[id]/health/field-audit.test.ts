import { Keypair } from '@stellar/stellar-sdk';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { queryMock, addObservationMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  addObservationMock: vi.fn(),
}));

vi.mock('@/lib/db/client', () => ({
  getPool: () => ({ query: queryMock }),
}));
vi.mock('@/lib/tree-health/store', () => ({
  addHealthObservation: addObservationMock,
  getTreeHealthSummary: vi.fn(),
}));

import { POST } from './route';

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/trees/tree-1/health', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('field audit submissions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    addObservationMock.mockReturnValue({
      observation: { id: 'observation-1', soilMoisturePercent: 42 },
      summary: { treeId: 'tree-1' },
    });
  });

  it('requires complete verifier audit metadata', async () => {
    const response = await POST(
      makeRequest({
        heightCm: 120,
        pestPresence: 'none',
        wateringStatus: 'adequate',
        soilMoisturePercent: 42,
        observerName: 'Field verifier',
        decision: 'approved',
      }),
      { params: Promise.resolve({ id: 'tree-1' }) }
    );

    expect(response.status).toBe(400);
    expect(queryMock).not.toHaveBeenCalled();
    expect(addObservationMock).not.toHaveBeenCalled();
  });

  it('rejects invalid soil moisture and verifier addresses', async () => {
    const response = await POST(
      makeRequest({
        heightCm: 120,
        pestPresence: 'none',
        wateringStatus: 'adequate',
        soilMoisturePercent: 101,
        observerName: 'Field verifier',
        verifierAddress: 'not-a-stellar-key',
        assignedAt: new Date(Date.now() - 60_000).toISOString(),
        decision: 'approved',
      }),
      { params: Promise.resolve({ id: 'tree-1' }) }
    );

    expect(response.status).toBe(400);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('persists valid field audits and includes the soil reading in the observation', async () => {
    queryMock.mockResolvedValue({ rows: [{ id: 'audit-1' }] });
    const verifierAddress = Keypair.random().publicKey();
    const assignedAt = new Date(Date.now() - 60_000).toISOString();

    const response = await POST(
      makeRequest({
        heightCm: 120,
        pestPresence: 'mild',
        wateringStatus: 'adequate',
        soilMoisturePercent: 42,
        observerName: 'Field verifier',
        verifierAddress,
        assignedAt,
        decision: 'approved',
      }),
      { params: Promise.resolve({ id: 'tree-1' }) }
    );

    expect(response.status).toBe(201);
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO verifier_audits'), [
      'tree-1',
      verifierAddress,
      assignedAt,
      'approved',
      42,
      120,
      'mild',
    ]);
    expect(addObservationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        treeId: 'tree-1',
        heightCm: 120,
        pestPresence: 'mild',
        soilMoisturePercent: 42,
      })
    );
    await expect(response.json()).resolves.toMatchObject({ auditId: 'audit-1' });
  });
});
