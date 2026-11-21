import type { RpcNodeConfig, RpcNodeHealth, RpcHealthState, RpcHealthCheckResult } from './types';
import logger from '@/lib/logger';

const DEFAULT_PING_TIMEOUT_MS = 5_000;
const MAX_CONSECUTIVE_FAILURES = 3;

function parseNodeConfigs(): RpcNodeConfig[] {
  const raw = process.env.RPC_NODE_URLS ?? '';
  const namesRaw = process.env.RPC_NODE_NAMES ?? '';
  const weightsRaw = process.env.RPC_NODE_WEIGHTS ?? '';

  const urls = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const names = namesRaw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const weights = weightsRaw
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => !Number.isNaN(n));

  return urls.map((url, i) => ({
    url,
    name: names[i] ?? `node-${i}`,
    weight: weights[i] ?? 1,
  }));
}

function buildInitialState(configs: RpcNodeConfig[]): RpcHealthState {
  const nodes: RpcNodeHealth[] = configs.map((cfg) => ({
    url: cfg.url,
    name: cfg.name,
    isHealthy: true,
    latencyMs: null,
    lastCheckedAt: null,
    consecutiveFailures: 0,
    lastError: null,
  }));

  return { nodes, bestNode: nodes[0] ?? null, lastCheckAt: null };
}

async function pingNode(url: string, timeoutMs: number): Promise<RpcHealthCheckResult> {
  const start = Date.now();
  try {
    const res = await fetch(`${url}/`, {
      method: 'HEAD',
      signal: AbortSignal.timeout(timeoutMs),
    });
    const latencyMs = Date.now() - start;
    const isHealthy = res.ok || res.status < 500;
    return {
      node: {
        url,
        name: '',
        isHealthy,
        latencyMs,
        lastCheckedAt: Date.now(),
        consecutiveFailures: 0,
        lastError: null,
      },
      isHealthy,
      latencyMs,
    };
  } catch (err) {
    const latencyMs = Date.now() - start;
    return {
      node: {
        url,
        name: '',
        isHealthy: false,
        latencyMs,
        lastCheckedAt: Date.now(),
        consecutiveFailures: 0,
        lastError: String(err),
      },
      isHealthy: false,
      latencyMs,
    };
  }
}

function pickBestNode(state: RpcHealthState): RpcNodeHealth | null {
  const healthy = state.nodes.filter((n) => n.isHealthy && n.latencyMs !== null);
  if (healthy.length === 0) return state.nodes[0] ?? null;

  healthy.sort((a, b) => (a.latencyMs ?? Infinity) - (b.latencyMs ?? Infinity));
  return healthy[0];
}

export class RpcHealthMonitor {
  private state: RpcHealthState;
  private configs: RpcNodeConfig[];
  private pingTimeoutMs: number;
  private maxFailures: number;

  constructor(configs?: RpcNodeConfig[]) {
    this.configs = configs ?? parseNodeConfigs();
    this.state = buildInitialState(this.configs);
    this.pingTimeoutMs = Number(process.env.RPC_PING_TIMEOUT_MS) || DEFAULT_PING_TIMEOUT_MS;
    this.maxFailures = Number(process.env.RPC_MAX_CONSECUTIVE_FAILURES) || MAX_CONSECUTIVE_FAILURES;
  }

  getConfigs(): RpcNodeConfig[] {
    return this.configs;
  }

  getState(): RpcHealthState {
    return this.state;
  }

  getBestNode(): RpcNodeHealth | null {
    return this.state.bestNode;
  }

  getBestUrl(): string {
    return this.state.bestNode?.url ?? this.configs[0]?.url ?? '';
  }

  async checkAll(): Promise<RpcHealthState> {
    const results = await Promise.all(
      this.configs.map(async (cfg) => {
        const result = await pingNode(cfg.url, this.pingTimeoutMs);
        return { cfg, result };
      })
    );

    for (const { cfg, result } of results) {
      const existing = this.state.nodes.find((n) => n.url === cfg.url);
      if (existing) {
        if (result.isHealthy) {
          existing.isHealthy = true;
          existing.latencyMs = result.latencyMs;
          existing.consecutiveFailures = 0;
          existing.lastError = null;
        } else {
          existing.consecutiveFailures += 1;
          existing.isHealthy = existing.consecutiveFailures < this.maxFailures;
          existing.latencyMs = result.latencyMs;
          existing.lastError = result.node.lastError;
        }
        existing.lastCheckedAt = Date.now();
      }
    }

    this.state.bestNode = pickBestNode(this.state);
    this.state.lastCheckAt = Date.now();

    logger.info('RPC health check complete', {
      totalNodes: this.state.nodes.length,
      healthyNodes: this.state.nodes.filter((n) => n.isHealthy).length,
      bestNode: this.state.bestNode?.name,
      bestLatencyMs: this.state.bestNode?.latencyMs,
    });

    return this.state;
  }
}

let globalMonitor: RpcHealthMonitor | null = null;

export function getRpcHealthMonitor(): RpcHealthMonitor {
  if (!globalMonitor) {
    globalMonitor = new RpcHealthMonitor();
  }
  return globalMonitor;
}
