import { beforeEach, describe, expect, it, vi } from 'vitest';

const queryMock = vi.fn();
vi.mock('@/lib/db/client', () => ({ getPool: () => ({ query: queryMock }) }));
vi.mock('@/lib/webhook/offset-verification-bridge', () => ({
  notifyCreditRetired: vi.fn(() => Promise.resolve([])),
}));

import { notifyCreditRetired } from '@/lib/webhook/offset-verification-bridge';
import { POST } from './route';

const mockedNotify = vi.mocked(notifyCreditRetired);
const WALLET = 'GUJZDEGXDNCF32EPF3DHODZDOCIS2JHTLGMXGEDN73U55XTPLPFT7V4S';
const TX_HASH = 'a'.repeat(64);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/credits/retire', () => {
  it('emits credit.retired once on new retirement receipt and skips on replay', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [] }) // idempotency check
      .mockResolvedValueOnce({ rows: [] }); // INSERT

    const res1 = await POST(
      new Request('https://app.example/api/credits/retire', {
        method: 'POST',
        body: JSON.stringify({
          retirementKey: 'ret_key_123456',
          buyerWallet: WALLET,
          creditAmount: 50,
          projectId: 'PROJ-004',
          projectName: 'Mangrove Restoration',
          coBenefits: ['Biodiversity'],
          network: 'testnet',
          txHash: TX_HASH,
        }),
      })
    );
    expect(res1.status).toBe(201);
    expect(mockedNotify).toHaveBeenCalledTimes(1);
    expect(mockedNotify).toHaveBeenCalledWith(
      expect.objectContaining({
        creditId: 'ret_key_123456',
        buyerWallet: WALLET,
        quantityTonnes: 50,
        projectId: 'PROJ-004',
      })
    );

    vi.clearAllMocks();
    queryMock.mockResolvedValueOnce({
      rows: [{ receipt_payload: { retirementKey: 'ret_key_123456' } }],
    });

    const res2 = await POST(
      new Request('https://app.example/api/credits/retire', {
        method: 'POST',
        body: JSON.stringify({
          retirementKey: 'ret_key_123456',
          buyerWallet: WALLET,
          creditAmount: 50,
          projectId: 'PROJ-004',
          projectName: 'Mangrove Restoration',
          coBenefits: ['Biodiversity'],
          network: 'testnet',
          txHash: TX_HASH,
        }),
      })
    );
    expect(res2.status).toBe(200);
    expect(mockedNotify).not.toHaveBeenCalled();
  });
});
