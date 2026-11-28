import { beforeEach, describe, expect, it, vi } from 'vitest';

const tokenizeMock = vi.fn();
vi.mock('@/lib/carbon-tokenization/runtime', () => ({
  registryClientFactory: vi.fn(() => ({})),
  getTokenizationOrchestrator: vi.fn(() => ({ tokenize: tokenizeMock })),
}));
vi.mock('@/lib/webhook/offset-verification-bridge', () => ({
  notifyCreditVerified: vi.fn(() => Promise.resolve([])),
}));

import { notifyCreditVerified } from '@/lib/webhook/offset-verification-bridge';
import { POST } from './route';

const mockedNotify = vi.mocked(notifyCreditVerified);
const WALLET = 'GUJZDEGXDNCF32EPF3DHODZDOCIS2JHTLGMXGEDN73U55XTPLPFT7V4S';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/tokenize-credit', () => {
  it('emits credit.verified when tokenization succeeds even if validation.project is null', async () => {
    tokenizeMock.mockResolvedValueOnce({
      success: true,
      tokenId: 'TK-100',
      mint: { txHash: '0xmint123', network: 'testnet', contractAddress: '0xcontract' },
      metadataUri: 'ipfs://meta',
      record: {
        id: 'rec-1',
        protocol: 'verra',
        projectId: 'VCS-1940',
        serialNumber: 'VCS-SN-001',
        vintage: 2024,
        tonnage: 100,
        recipientWallet: WALLET,
        mintedAt: '2026-06-01T00:00:00.000Z',
      },
      validation: {
        validationId: 'val-1',
        validatedAt: '2026-06-01T00:00:00.000Z',
        project: null,
        retirement: null,
      },
      errors: [],
    });

    const res = await POST(
      new Request('https://app.example/api/tokenize-credit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'verra',
          projectId: 'VCS-1940',
          serialNumber: 'VCS-SN-001',
          recipientWallet: WALLET,
          vintage: 2024,
          quantity: 100,
        }),
      })
    );
    expect(res.status).toBe(201);
    expect(mockedNotify).toHaveBeenCalledWith(
      expect.objectContaining({
        creditId: 'TK-100',
        projectId: 'VCS-1940',
        projectName: 'VCS-1940',
        quantityTonnes: 100,
        transactionHash: '0xmint123',
      })
    );
  });
});
