import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { RpcHealthMonitor } from '../rpc-health';
import type { RpcNodeConfig } from '../types';

const NODE_A = 'https://horizon-testnet.stellar.org';
const NODE_B = 'https://horizon.stellar.org';

function createMonitor(configs?: RpcNodeConfig[]) {
  return new RpcHealthMonitor(
    configs ?? [
      { url: NODE_A, name: 'testnet-a', weight: 1 },
      { url: NODE_B, name: 'mainnet-b', weight: 1 },
    ]
  );
}

describe('RpcHealthMonitor', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    global.fetch = originalFetch;
  });

  describe('getConfigs', () => {
    it('returns the configured nodes', () => {
      const monitor = createMonitor();
      const configs = monitor.getConfigs();
      expect(configs).toHaveLength(2);
      expect(configs[0].url).toBe(NODE_A);
      expect(configs[1].url).toBe(NODE_B);
    });
  });

  describe('getState', () => {
    it('returns initial state with all nodes marked healthy', () => {
      const monitor = createMonitor();
      const state = monitor.getState();
      expect(state.nodes).toHaveLength(2);
      expect(state.nodes.every((n) => n.isHealthy)).toBe(true);
      expect(state.bestNode?.url).toBe(NODE_A);
      expect(state.lastCheckAt).toBeNull();
    });
  });

  describe('getBestUrl', () => {
    it('returns the first node URL initially', () => {
      const monitor = createMonitor();
      expect(monitor.getBestUrl()).toBe(NODE_A);
    });

    it('returns empty string when no nodes configured', () => {
      const monitor = new RpcHealthMonitor([]);
      expect(monitor.getBestUrl()).toBe('');
    });
  });

  describe('checkAll', () => {
    it('marks nodes as healthy on successful ping', async () => {
      vi.mocked(fetch).mockResolvedValue({ ok: true, status: 200 } as Response);

      const monitor = createMonitor();
      const state = await monitor.checkAll();

      expect(state.nodes).toHaveLength(2);
      for (const node of state.nodes) {
        expect(node.isHealthy).toBe(true);
        expect(node.latencyMs).toBeGreaterThanOrEqual(0);
        expect(node.lastCheckedAt).not.toBeNull();
        expect(node.consecutiveFailures).toBe(0);
        expect(node.lastError).toBeNull();
      }
      expect(state.lastCheckAt).not.toBeNull();
    });

    it('picks the lowest-latency node as best', async () => {
      vi.mocked(fetch)
        .mockResolvedValueOnce(
          new Promise((resolve) =>
            setTimeout(() => resolve({ ok: true, status: 200 } as Response), 50)
          )
        )
        .mockResolvedValueOnce(
          new Promise((resolve) =>
            setTimeout(() => resolve({ ok: true, status: 200 } as Response), 10)
          )
        );

      const monitor = createMonitor();
      const state = await monitor.checkAll();

      expect(state.bestNode?.url).toBe(NODE_B);
    });

    it('marks node as unhealthy after max consecutive failures', async () => {
      vi.mocked(fetch).mockRejectedValue(new Error('connection refused'));
      process.env.RPC_MAX_CONSECUTIVE_FAILURES = '2';

      const monitor = createMonitor();
      await monitor.checkAll();
      await monitor.checkAll();
      const state = await monitor.checkAll();

      for (const node of state.nodes) {
        expect(node.isHealthy).toBe(false);
        expect(node.consecutiveFailures).toBe(3);
        expect(node.lastError).toBe('Error: connection refused');
      }
    });

    it('recovery after failure resets consecutive failures', async () => {
      vi.mocked(fetch)
        .mockRejectedValueOnce(new Error('timeout'))
        .mockRejectedValueOnce(new Error('timeout'))
        .mockResolvedValue({ ok: true, status: 200 } as Response);

      const monitor = createMonitor();
      await monitor.checkAll();
      await monitor.checkAll();
      const state = await monitor.checkAll();

      for (const node of state.nodes) {
        expect(node.isHealthy).toBe(true);
        expect(node.consecutiveFailures).toBe(0);
        expect(node.latencyMs).toBeGreaterThanOrEqual(0);
      }
    });

    it('marks node unhealthy after consecutive 5xx responses exceed threshold', async () => {
      vi.mocked(fetch).mockResolvedValue({ ok: false, status: 503 } as Response);
      process.env.RPC_MAX_CONSECUTIVE_FAILURES = '1';

      const monitor = createMonitor();
      await monitor.checkAll();
      const state = await monitor.checkAll();

      for (const node of state.nodes) {
        expect(node.isHealthy).toBe(false);
        expect(node.consecutiveFailures).toBe(2);
      }
    });

    it('handles empty node list gracefully', async () => {
      const monitor = new RpcHealthMonitor([]);
      const state = await monitor.checkAll();
      expect(state.nodes).toHaveLength(0);
      expect(state.bestNode).toBeNull();
    });
  });
});
