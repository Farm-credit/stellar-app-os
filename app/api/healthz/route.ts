import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db/client';
import { RpcHealthMonitor } from '@/lib/monitor/rpc-health';

async function checkDb(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const start = Date.now();
  try {
    const pool = getPool();
    await pool.query('SELECT 1');
    return { ok: true, latencyMs: Date.now() - start };
  } catch (err) {
    return { ok: false, latencyMs: Date.now() - start, error: String(err) };
  }
}

async function checkRpcNodes(): Promise<{
  ok: boolean;
  nodes: Array<{
    name: string;
    url: string;
    ok: boolean;
    latencyMs: number | null;
    error?: string;
  }>;
  bestNode: string | null;
}> {
  try {
    const monitor = new RpcHealthMonitor();
    const state = await monitor.checkAll();
    const nodes = state.nodes.map((n) => ({
      name: n.name,
      url: n.url,
      ok: n.isHealthy,
      latencyMs: n.latencyMs,
      ...(n.lastError ? { error: n.lastError } : {}),
    }));
    return {
      ok: state.nodes.some((n) => n.isHealthy),
      nodes,
      bestNode: state.bestNode?.name ?? null,
    };
  } catch (_err) {
    return {
      ok: false,
      nodes: [],
      bestNode: null,
    };
  }
}

export async function GET() {
  const [db, rpc] = await Promise.all([checkDb(), checkRpcNodes()]);

  const allOk = db.ok && rpc.ok;
  const status = allOk ? 200 : 503;

  return NextResponse.json(
    {
      status: allOk ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      checks: { db, rpc },
    },
    { status }
  );
}

export function HEAD() {
  return new NextResponse(null, { status: 200 });
}
