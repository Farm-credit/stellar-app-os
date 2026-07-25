export interface HorizonNodeConfig {
  url: string;
  label?: string;
}

export interface NodeHealth {
  url: string;
  label: string;
  ok: boolean;
  latencyMs: number;
  lastCheck: number;
  error?: string;
}

export interface HealthCheckConfig {
  nodeUrls: string[];
  checkIntervalMs: number;
  requestTimeoutMs: number;
  maxStaleMs: number;
}

export interface RouterState {
  nodes: Map<string, NodeHealth>;
  sortedHealthy: string[];
  lastSort: number;
}
