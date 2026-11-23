import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Keypair } from '@stellar/stellar-sdk';
import { GET, POST } from './route';

const { listEligible, issueForTree, getPool } = vi.hoisted(() => ({
  listEligible: vi.fn(),
  issueForTree: vi.fn(),
  getPool: vi.fn(),
}));

vi.mock('@/lib/carbon/verified-field-credits', () => ({
  FieldCreditAlreadyReservedError: class FieldCreditAlreadyReservedError extends Error {},
  FieldCreditNotEligibleError: class FieldCreditNotEligibleError extends Error {},
  listEligibleFieldCredits: listEligible,
  issueFieldCreditForTree: issueForTree,
}));

vi.mock('@/lib/db/client', () => ({ getPool }));

function getRequest(sponsorWallet: string) {
  return new Request(`http://localhost/api/field-credits?sponsorWallet=${sponsorWallet}`);
}

function postRequest(body: unknown) {
  return new Request('http://localhost/api/field-credits', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const originalToken = process.env.FIELD_CREDIT_ISSUER_TOKEN;
const originalContract = process.env.NEXT_PUBLIC_CONTRACT_CARBON_CREDITS;

describe('privileged verified-field issuance API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.FIELD_CREDIT_ISSUER_TOKEN = 'test-issuer-token-32-characters-long';
    process.env.NEXT_PUBLIC_CONTRACT_CARBON_CREDITS = 'C'.repeat(56);
    getPool.mockReturnValue({});
  });

  afterEach(() => {
    if (originalToken === undefined) delete process.env.FIELD_CREDIT_ISSUER_TOKEN;
    else process.env.FIELD_CREDIT_ISSUER_TOKEN = originalToken;
    if (originalContract === undefined) delete process.env.NEXT_PUBLIC_CONTRACT_CARBON_CREDITS;
    else process.env.NEXT_PUBLIC_CONTRACT_CARBON_CREDITS = originalContract;
  });

  it('fails closed when the privileged token is not configured', async () => {
    delete process.env.FIELD_CREDIT_ISSUER_TOKEN;
    const wallet = Keypair.random().publicKey();
    const response = await GET(getRequest(wallet));
    expect(response.status).toBe(503);
    expect(listEligible).not.toHaveBeenCalled();
    expect(getPool).not.toHaveBeenCalled();
  });

  it('rejects unauthorized preview requests before querying the database', async () => {
    const wallet = Keypair.random().publicKey();
    const response = await GET(getRequest(wallet));
    expect(response.status).toBe(401);
    expect(listEligible).not.toHaveBeenCalled();
    expect(getPool).not.toHaveBeenCalled();
  });

  it('validates an authorized issuance request before starting a reservation', async () => {
    const wallet = Keypair.random().publicKey();
    const request = postRequest({ sponsorWallet: wallet, treeId: 0, network: 'testnet' });
    request.headers.set('authorization', `Bearer ${process.env.FIELD_CREDIT_ISSUER_TOKEN}`);
    const response = await POST(request);
    expect(response.status).toBe(400);
    expect(issueForTree).not.toHaveBeenCalled();
    expect(getPool).not.toHaveBeenCalled();
  });
});
