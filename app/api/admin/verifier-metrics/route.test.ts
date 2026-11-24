import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { isAdminMock, getPoolMock, getReportMock } = vi.hoisted(() => ({
  isAdminMock: vi.fn(),
  getPoolMock: vi.fn(),
  getReportMock: vi.fn(),
}));

vi.mock('@/lib/auth/admin', () => ({ isAdminRequest: isAdminMock }));
vi.mock('@/lib/db/client', () => ({ getPool: getPoolMock }));
vi.mock('@/lib/verifier/performance', () => ({
  getVerifierPerformanceReport: getReportMock,
}));

import { GET } from './route';

describe('GET /api/admin/verifier-metrics', () => {
  const originalContractId = process.env.VERIFIER_STAKING_CONTRACT_ID;

  beforeEach(() => {
    vi.clearAllMocks();
    getPoolMock.mockReturnValue({ query: vi.fn() });
    getReportMock.mockResolvedValue({
      verifiers: [],
      slashHistory: [],
      slashHistoryConfigured: false,
    });
  });

  afterEach(() => {
    if (originalContractId === undefined) {
      delete process.env.VERIFIER_STAKING_CONTRACT_ID;
    } else {
      process.env.VERIFIER_STAKING_CONTRACT_ID = originalContractId;
    }
  });

  it('rejects requests without administrator access', async () => {
    isAdminMock.mockResolvedValue(false);

    const response = await GET();

    expect(response.status).toBe(401);
    expect(getReportMock).not.toHaveBeenCalled();
  });

  it('returns the authenticated performance report', async () => {
    isAdminMock.mockResolvedValue(true);
    process.env.VERIFIER_STAKING_CONTRACT_ID = 'CSTAKINGCONTRACT';

    const response = await GET();

    expect(response.status).toBe(200);
    expect(getReportMock).toHaveBeenCalledWith(
      expect.objectContaining({ query: expect.any(Function) }),
      'CSTAKINGCONTRACT'
    );
    expect(response.headers.get('Cache-Control')).toContain('private');
  });
});
