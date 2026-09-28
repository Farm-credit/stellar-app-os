/**
 * Route tests for GET/POST /api/v2/cross-chain-bridge — Issue #1093.
 *
 * The Soroban client layer is mocked; these tests validate the HTTP surface:
 * parameter parsing/validation, response shapes, and error mapping.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getBridgeLock: vi.fn(),
  getLocksForSender: vi.fn(),
  quoteBridgeFee: vi.fn(),
  getBridgeConfig: vi.fn(),
  executePurchase: vi.fn(),
  cancelLock: vi.fn(),
  setBridgePaused: vi.fn(),
  setBridgeFeeBps: vi.fn(),
  setBridgeTreeEscrow: vi.fn(),
}));

vi.mock('@/lib/stellar/xlm-bridge', () => mocks);

import { GET, POST } from './route';

const BASE = 'http://localhost:3000/api/v2/cross-chain-bridge';
const G_ADDR = 'G'.repeat(56);
const C_ADDR = 'C'.repeat(56);

function get(query = ''): Request {
  return new Request(`${BASE}${query}`);
}

function post(body: unknown): Request {
  return new Request(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/v2/cross-chain-bridge', () => {
  it('returns the bridge config by default', async () => {
    mocks.getBridgeConfig.mockResolvedValue({
      admin: G_ADDR,
      xlm: 'XLM',
      treeEscrow: C_ADDR,
      feeWallet: G_ADDR,
      feeBps: 50,
      paused: false,
      lockCount: 3,
    });

    const res = await GET(get());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(res.headers.get('X-API-Version')).toBe('v2');
    expect(body.config.feeBps).toBe(50);
    expect(body.config.lockCount).toBe(3);
    expect(mocks.getBridgeConfig).toHaveBeenCalledWith('testnet');
  });

  it('returns a single lock by lockId', async () => {
    mocks.getBridgeLock.mockResolvedValue({
      id: 7,
      sender: G_ADDR,
      recipient: G_ADDR,
      farmer: G_ADDR,
      amount: '10000000',
      treeCount: '10',
      areaHectares: '2',
      sourceChain: 'ethereum',
      sourceSender: '0xabc',
      feePaid: '0',
      lockedAt: 1_700_000_000,
      status: 'Locked',
      treesBought: '0',
    });

    const res = await GET(get('?lockId=7'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.lock.id).toBe(7);
    expect(body.lock.status).toBe('Locked');
    expect(mocks.getBridgeLock).toHaveBeenCalledWith(7, 'testnet');
  });

  it('404s for an unknown lock', async () => {
    mocks.getBridgeLock.mockResolvedValue(null);
    const res = await GET(get('?lockId=999'));
    expect(res.status).toBe(404);
  });

  it('400s on malformed lockId', async () => {
    const res = await GET(get('?lockId=-3'));
    expect(res.status).toBe(400);
  });

  it('returns lock ids for a sender', async () => {
    mocks.getLocksForSender.mockResolvedValue([1, 2, 3]);
    const res = await GET(get(`?sender=${G_ADDR}`));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.lockIds).toEqual([1, 2, 3]);
  });

  it('400s on a malformed sender address', async () => {
    const res = await GET(get('?sender=not-an-address'));
    expect(res.status).toBe(400);
  });

  it('quotes the bridge fee for an amount', async () => {
    mocks.quoteBridgeFee.mockResolvedValue('50500');
    const res = await GET(get('?amount=10100000'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.fee).toBe('50500');
    expect(mocks.quoteBridgeFee).toHaveBeenCalledWith('10100000', 'testnet');
  });

  it('400s on a malformed amount', async () => {
    const res = await GET(get('?amount=1.5'));
    expect(res.status).toBe(400);
  });

  it('passes mainnet through to the client', async () => {
    mocks.getBridgeConfig.mockResolvedValue({ lockCount: 0 });
    await GET(get('?network=mainnet'));
    expect(mocks.getBridgeConfig).toHaveBeenCalledWith('mainnet');
  });

  it('maps client errors to 502', async () => {
    mocks.getBridgeConfig.mockRejectedValue(new Error('NEXT_PUBLIC_CONTRACT_XLM_BRIDGE is not set'));
    const res = await GET(get());
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe('bridge query failed');
  });
});

describe('POST /api/v2/cross-chain-bridge', () => {
  it('submits an execute action', async () => {
    mocks.executePurchase.mockResolvedValue('hash-execute');
    const res = await POST(post({ action: 'execute', lockId: 5 }));
    const body = await res.json();
    expect(res.status).toBe(202);
    expect(body.hash).toBe('hash-execute');
    expect(mocks.executePurchase).toHaveBeenCalledWith(5, 'testnet');
  });

  it('rejects execute without a valid lockId', async () => {
    const res = await POST(post({ action: 'execute', lockId: 0 }));
    expect(res.status).toBe(400);
  });

  it('submits a cancel action', async () => {
    mocks.cancelLock.mockResolvedValue('hash-cancel');
    const res = await POST(post({ action: 'cancel', lockId: 5 }));
    expect(res.status).toBe(202);
    expect(mocks.cancelLock).toHaveBeenCalledWith(5, 'testnet');
  });

  it('submits pause and unpause', async () => {
    mocks.setBridgePaused.mockResolvedValue('hash-pause');
    const res = await POST(post({ action: 'pause' }));
    expect(res.status).toBe(202);
    expect(mocks.setBridgePaused).toHaveBeenCalledWith(true, 'testnet');

    const res2 = await POST(post({ action: 'unpause' }));
    expect(res2.status).toBe(202);
    expect(mocks.setBridgePaused).toHaveBeenCalledWith(false, 'testnet');
  });

  it('validates fee bounds on set-fee', async () => {
    const res = await POST(post({ action: 'set-fee', feeBps: 501 }));
    expect(res.status).toBe(400);

    mocks.setBridgeFeeBps.mockResolvedValue('hash-fee');
    const ok = await POST(post({ action: 'set-fee', feeBps: 25 }));
    expect(ok.status).toBe(202);
    expect(mocks.setBridgeFeeBps).toHaveBeenCalledWith(25, 'testnet');
  });

  it('validates the escrow address on set-escrow', async () => {
    const res = await POST(post({ action: 'set-escrow', escrow: 'nope' }));
    expect(res.status).toBe(400);

    mocks.setBridgeTreeEscrow.mockResolvedValue('hash-escrow');
    const ok = await POST(post({ action: 'set-escrow', escrow: C_ADDR }));
    expect(ok.status).toBe(202);
    expect(mocks.setBridgeTreeEscrow).toHaveBeenCalledWith(C_ADDR, 'testnet');
  });

  it('400s on unknown actions and invalid JSON', async () => {
    const unknown = await POST(post({ action: 'self-destruct' }));
    expect(unknown.status).toBe(400);

    const bad = new Request(BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    });
    expect((await POST(bad)).status).toBe(400);
  });

  it('maps client errors to 502', async () => {
    mocks.executePurchase.mockRejectedValue(new Error('simulation failed'));
    const res = await POST(post({ action: 'execute', lockId: 1 }));
    expect(res.status).toBe(502);
  });
});
