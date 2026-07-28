import { Horizon } from '@stellar/stellar-sdk';
import { checkAllNodes, checkNode } from './health';
import { loadNodeConfig } from './config';
import type { NodeHealth } from './types';

interface RouterState {
  nodes: Map<string, NodeHealth>;
  sortedHealthy: string[];
  lastSort: number;
}

const state: RouterState = {
  nodes: new Map(),
  sortedHealthy: [],
  lastSort: 0,
};

export function resetState(): void {
  state.nodes.clear();
  state.sortedHealthy = [];
  state.lastSort = 0;
}

export function getState(): Readonly<RouterState> {
  return state;
}

export async function refreshHealth(): Promise<void> {
  const results = await checkAllNodes();

  for (const h of results) {
    state.nodes.set(h.url, h);
  }

  resort();
}

export async function checkNodeNow(url: string): Promise<NodeHealth> {
  const result = await checkNode({ url, label: url });
  state.nodes.set(url, result);
  resort();
  return result;
}

function resort(): void {
  const healthy: { url: string; latencyMs: number }[] = [];

  for (const [, h] of state.nodes) {
    if (h.ok) {
      healthy.push({ url: h.url, latencyMs: h.latencyMs });
    }
  }

  healthy.sort((a, b) => a.latencyMs - b.latencyMs);
  state.sortedHealthy = healthy.map((h) => h.url);
  state.lastSort = Date.now();
}

export function getFastestNodeUrl(): string | null {
  if (state.sortedHealthy.length > 0) {
    return state.sortedHealthy[0];
  }

  const { nodes } = loadNodeConfig();
  return nodes.length > 0 ? nodes[0].url : null;
}

export function getFastestNodeHealth(): NodeHealth | null {
  const url = getFastestNodeUrl();
  if (!url) return null;
  return state.nodes.get(url) ?? null;
}

export function getAllNodeHealth(): NodeHealth[] {
  const all: NodeHealth[] = [];
  for (const [, h] of state.nodes) {
    all.push(h);
  }
  return all;
}

export function createServer(url?: string): Horizon.Server {
  const target = url ?? getFastestNodeUrl() ?? loadNodeConfig().nodes[0]?.url;
  return new Horizon.Server(target, { allowHttp: true });
}
