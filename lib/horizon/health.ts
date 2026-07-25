import { loadNodeConfig, loadHealthCheckConfig } from './config';
import type { NodeHealth, HorizonNodeConfig } from './types';

export async function checkNode(
  node: HorizonNodeConfig,
  timeoutMs: number = 5_000
): Promise<NodeHealth> {
  const start = Date.now();
  try {
    const url = node.url.replace(/\/+$/, '');
    const res = await fetch(url, {
      method: 'HEAD',
      signal: AbortSignal.timeout(timeoutMs),
    });
    return {
      url: node.url,
      label: node.label ?? node.url,
      ok: res.ok || res.status < 500,
      latencyMs: Date.now() - start,
      lastCheck: Date.now(),
    };
  } catch (err) {
    return {
      url: node.url,
      label: node.label ?? node.url,
      ok: false,
      latencyMs: Date.now() - start,
      lastCheck: Date.now(),
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function checkAllNodes(nodes?: HorizonNodeConfig[]): Promise<NodeHealth[]> {
  const config = loadNodeConfig();
  const hcConfig = loadHealthCheckConfig();
  const targets = nodes ?? config.nodes;

  const results = await Promise.all(
    targets.map((node) => checkNode(node, hcConfig.requestTimeoutMs))
  );

  return results;
}
