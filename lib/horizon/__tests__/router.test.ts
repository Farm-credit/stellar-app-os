import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  checkNodeNow,
  refreshHealth,
  getFastestNodeUrl,
  getAllNodeHealth,
  getState,
  createServer,
  resetState,
} from '../router';
import { checkNode, checkAllNodes } from '../health';

vi.mock('../health', () => ({
  checkNode: vi.fn(),
  checkAllNodes: vi.fn(),
}));

vi.mock('../config', () => ({
  loadNodeConfig: vi.fn(() => ({
    nodes: [
      { url: 'https://horizon-testnet.stellar.org', label: 'node-1' },
      { url: 'https://horizon-testnet-2.stellar.org', label: 'node-2' },
    ],
  })),
  loadHealthCheckConfig: vi.fn(() => ({
    nodeUrls: ['https://horizon-testnet.stellar.org', 'https://horizon-testnet-2.stellar.org'],
    checkIntervalMs: 30000,
    requestTimeoutMs: 5000,
    maxStaleMs: 60000,
  })),
}));

const mockCheckNode = vi.mocked(checkNode);
const mockCheckAllNodes = vi.mocked(checkAllNodes);

beforeEach(() => {
  vi.clearAllMocks();
  resetState();
});

describe('refreshHealth', () => {
  it('updates state with health check results and sorts by latency', async () => {
    mockCheckAllNodes.mockResolvedValue([
      {
        url: 'https://horizon-testnet.stellar.org',
        label: 'node-1',
        ok: true,
        latencyMs: 150,
        lastCheck: Date.now(),
      },
      {
        url: 'https://horizon-testnet-2.stellar.org',
        label: 'node-2',
        ok: true,
        latencyMs: 50,
        lastCheck: Date.now(),
      },
    ]);

    await refreshHealth();

    const state = getState();
    expect(state.sortedHealthy).toHaveLength(2);
    expect(state.sortedHealthy[0]).toBe('https://horizon-testnet-2.stellar.org');
    expect(state.sortedHealthy[1]).toBe('https://horizon-testnet.stellar.org');
  });

  it('sorts only healthy nodes', async () => {
    mockCheckAllNodes.mockResolvedValue([
      {
        url: 'https://horizon-testnet.stellar.org',
        label: 'node-1',
        ok: false,
        latencyMs: 5000,
        lastCheck: Date.now(),
        error: 'timeout',
      },
      {
        url: 'https://horizon-testnet-2.stellar.org',
        label: 'node-2',
        ok: true,
        latencyMs: 50,
        lastCheck: Date.now(),
      },
    ]);

    await refreshHealth();

    const state = getState();
    expect(state.sortedHealthy).toHaveLength(1);
    expect(state.sortedHealthy[0]).toBe('https://horizon-testnet-2.stellar.org');
  });
});

describe('getFastestNodeUrl', () => {
  it('returns the first configured node as fallback when none are healthy', () => {
    const url = getFastestNodeUrl();
    expect(url).toBe('https://horizon-testnet.stellar.org');
  });

  it('returns the fastest healthy node after refresh', async () => {
    mockCheckAllNodes.mockResolvedValue([
      {
        url: 'https://horizon-testnet.stellar.org',
        label: 'node-1',
        ok: true,
        latencyMs: 150,
        lastCheck: Date.now(),
      },
      {
        url: 'https://horizon-testnet-2.stellar.org',
        label: 'node-2',
        ok: true,
        latencyMs: 50,
        lastCheck: Date.now(),
      },
    ]);

    await refreshHealth();
    expect(getFastestNodeUrl()).toBe('https://horizon-testnet-2.stellar.org');
  });
});

describe('checkNodeNow', () => {
  it('checks a single node and updates state', async () => {
    mockCheckNode.mockResolvedValue({
      url: 'https://horizon-testnet.stellar.org',
      label: 'https://horizon-testnet.stellar.org',
      ok: true,
      latencyMs: 100,
      lastCheck: Date.now(),
    });

    const result = await checkNodeNow('https://horizon-testnet.stellar.org');
    expect(result.ok).toBe(true);
    expect(result.latencyMs).toBe(100);
  });
});

describe('getAllNodeHealth', () => {
  it('returns all stored node health results', async () => {
    mockCheckAllNodes.mockResolvedValue([
      {
        url: 'https://horizon-testnet.stellar.org',
        label: 'node-1',
        ok: true,
        latencyMs: 100,
        lastCheck: Date.now(),
      },
    ]);

    await refreshHealth();
    const all = getAllNodeHealth();
    expect(all).toHaveLength(1);
    expect(all[0].url).toBe('https://horizon-testnet.stellar.org');
  });
});

describe('createServer', () => {
  it('returns a Horizon.Server instance', () => {
    const server = createServer('https://horizon-testnet.stellar.org');
    expect(server).toBeDefined();
  });
});
