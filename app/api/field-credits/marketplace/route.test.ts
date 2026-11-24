import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as getMarketplace } from './route';
import { GET as getIssuance } from '../issuance/route';

const { listLots, getDetails } = vi.hoisted(() => ({
  listLots: vi.fn(),
  getDetails: vi.fn(),
}));

vi.mock('@/lib/stellar/carbon-credits-client', () => ({
  listVerifiedFieldRetailLots: listLots,
  getVerifiedFieldCreditDetails: getDetails,
}));

function request(path: string) {
  return new Request(`http://localhost${path}`);
}

describe('verified field-credit marketplace reads', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_STELLAR_NETWORK = 'testnet';
  });

  it('returns active field-evidence lots from the configured network', async () => {
    listLots.mockResolvedValue([
      {
        id: 7,
        projectId: 'PLOT-7',
        seller: 'GSPONSOR',
        totalGrams: 2_000_000,
        remainingGrams: 1_000_000,
        pricePerTon: '25',
        active: true,
        openedAt: 123,
        evidenceDigest: 'a'.repeat(64),
      },
    ]);

    const response = await getMarketplace(request('/api/field-credits/marketplace'));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      network: 'testnet',
      lots: [{ id: 7, evidenceDigest: 'a'.repeat(64) }],
    });
    expect(listLots).toHaveBeenCalledWith('testnet', 25);
  });

  it('rejects unsupported network values', async () => {
    const response = await getMarketplace(request('/api/field-credits/marketplace?network=local'));
    expect(response.status).toBe(400);
    expect(listLots).not.toHaveBeenCalled();
  });

  it('looks up only a correctly formatted explicit issuance digest', async () => {
    getDetails.mockResolvedValue({
      sponsor: 'GSPONSOR',
      projectId: 'PLOT-7',
      issuedGrams: 2_000_000,
      availableGrams: 1_000_000,
      evidenceDigest: 'b'.repeat(64),
    });
    const response = await getIssuance(
      request(`/api/field-credits/issuance?digest=${'b'.repeat(64)}`)
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      credit: { projectId: 'PLOT-7', availableGrams: 1_000_000 },
    });
    expect(getDetails).toHaveBeenCalledWith('b'.repeat(64), 'testnet');
  });

  it('rejects malformed digests before querying Soroban', async () => {
    const response = await getIssuance(request('/api/field-credits/issuance?digest=not-a-digest'));
    expect(response.status).toBe(400);
    expect(getDetails).not.toHaveBeenCalled();
  });

  it('returns not found only when the on-chain contract reports a missing field record', async () => {
    getDetails.mockRejectedValue(new Error('Error(Contract, #28)'));
    const response = await getIssuance(
      request(`/api/field-credits/issuance?digest=${'c'.repeat(64)}`)
    );
    expect(response.status).toBe(404);
  });

  it('returns a retryable service error when the contract cannot be reached', async () => {
    getDetails.mockRejectedValue(new Error('network unavailable'));
    const response = await getIssuance(
      request(`/api/field-credits/issuance?digest=${'d'.repeat(64)}`)
    );
    expect(response.status).toBe(503);
  });
});
