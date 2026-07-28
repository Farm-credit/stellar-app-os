import type { HealthCheckConfig, HorizonNodeConfig } from './types';

export function loadNodeConfig(): { nodes: HorizonNodeConfig[] } {
  const raw =
    process.env.HORIZON_NODE_URLS ||
    process.env.NEXT_PUBLIC_HORIZON_URL ||
    'https://horizon-testnet.stellar.org';

  if (raw.includes(',')) {
    const urls = raw
      .split(',')
      .map((u) => u.trim())
      .filter(Boolean);
    return {
      nodes: urls.map((url, i) => ({ url, label: `node-${i + 1}` })),
    };
  }

  return {
    nodes: [{ url: raw, label: 'default' }],
  };
}

export function loadHealthCheckConfig(): HealthCheckConfig {
  const { nodes } = loadNodeConfig();
  return {
    nodeUrls: nodes.map((n) => n.url),
    checkIntervalMs: Number(process.env.HORIZON_HEALTH_CHECK_INTERVAL_MS) || 30_000,
    requestTimeoutMs: Number(process.env.HORIZON_REQUEST_TIMEOUT_MS) || 5_000,
    maxStaleMs: Number(process.env.HORIZON_MAX_STALE_MS) || 60_000,
  };
}
