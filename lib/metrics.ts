/**
 * Minimal in-process Prometheus-format metrics.
 * Tracks API request latency histogram and error counter per route.
 * Resets on process restart — suitable for single-instance deployments.
 */

interface HistogramBucket {
  le: number;
  count: number;
}

const LATENCY_BUCKETS = [25, 50, 100, 250, 500, 1000, 2500, 5000];

interface RouteMetrics {
  requestCount: number;
  errorCount: number;
  totalDurationMs: number;
  buckets: HistogramBucket[];
}

const store = new Map<string, RouteMetrics>();

function getOrCreate(route: string): RouteMetrics {
  if (!store.has(route)) {
    store.set(route, {
      requestCount: 0,
      errorCount: 0,
      totalDurationMs: 0,
      buckets: LATENCY_BUCKETS.map((le) => ({ le, count: 0 })),
    });
  }
  return store.get(route)!;
}

export function recordRequest(route: string, durationMs: number, isError: boolean): void {
  const m = getOrCreate(route);
  m.requestCount++;
  m.totalDurationMs += durationMs;
  if (isError) m.errorCount++;
  for (const b of m.buckets) {
    if (durationMs <= b.le) b.count++;
  }
}

export function renderPrometheusText(): string {
  const lines: string[] = [];

  lines.push('# HELP api_request_duration_ms API request latency in milliseconds');
  lines.push('# TYPE api_request_duration_ms histogram');

  for (const [route, m] of store) {
    const labels = `route="${route}"`;
    for (const b of m.buckets) {
      lines.push(`api_request_duration_ms_bucket{${labels},le="${b.le}"} ${b.count}`);
    }
    lines.push(`api_request_duration_ms_bucket{${labels},le="+Inf"} ${m.requestCount}`);
    lines.push(`api_request_duration_ms_sum{${labels}} ${m.totalDurationMs}`);
    lines.push(`api_request_duration_ms_count{${labels}} ${m.requestCount}`);
  }

  lines.push('');
  lines.push('# HELP api_error_total Total API errors per route');
  lines.push('# TYPE api_error_total counter');

  for (const [route, m] of store) {
    lines.push(`api_error_total{route="${route}"} ${m.errorCount}`);
  }

  lines.push('');
  lines.push('# HELP api_request_total Total API requests per route');
  lines.push('# TYPE api_request_total counter');

  for (const [route, m] of store) {
    lines.push(`api_request_total{route="${route}"} ${m.requestCount}`);
  }

  return lines.join('\n') + '\n';
}
