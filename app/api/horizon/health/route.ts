import { NextResponse } from 'next/server';
import {
  getAllNodeHealth,
  getFastestNodeUrl,
  getFastestNodeHealth,
  refreshHealth,
} from '@/lib/horizon/router';

export async function GET() {
  try {
    await refreshHealth();

    const all = getAllNodeHealth();
    const fastestUrl = getFastestNodeUrl();
    const fastest = getFastestNodeHealth();

    const allOk = all.length > 0 && all.every((h) => h.ok);
    const status = allOk ? 200 : all.some((h) => h.ok) ? 200 : 503;

    return NextResponse.json(
      {
        status: allOk ? 'ok' : all.some((h) => h.ok) ? 'degraded' : 'down',
        timestamp: new Date().toISOString(),
        totalNodes: all.length,
        healthyNodes: all.filter((h) => h.ok).length,
        fastestNode: fastest
          ? { url: fastestUrl, label: fastest.label, latencyMs: fastest.latencyMs }
          : null,
        nodes: all.map((h) => ({
          url: h.url,
          label: h.label,
          ok: h.ok,
          latencyMs: h.latencyMs,
          lastCheck: new Date(h.lastCheck).toISOString(),
          error: h.error ?? null,
        })),
      },
      { status }
    );
  } catch (err) {
    console.error('[api/horizon/health] error:', err);
    return NextResponse.json(
      {
        status: 'error',
        timestamp: new Date().toISOString(),
        error: err instanceof Error ? err.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}
