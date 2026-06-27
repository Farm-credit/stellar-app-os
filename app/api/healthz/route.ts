import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db/client';

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

async function checkHorizon(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const horizonUrl = process.env.NEXT_PUBLIC_HORIZON_URL ?? 'https://horizon-testnet.stellar.org';
  const start = Date.now();
  try {
    const res = await fetch(horizonUrl, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
    return { ok: res.ok || res.status < 500, latencyMs: Date.now() - start };
  } catch (err) {
    return { ok: false, latencyMs: Date.now() - start, error: String(err) };
  }
}

export async function GET() {
  const [db, horizon] = await Promise.all([checkDb(), checkHorizon()]);

  const allOk = db.ok && horizon.ok;
  const status = allOk ? 200 : 503;

  return NextResponse.json(
    {
      status: allOk ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      checks: { db, horizon },
    },
    { status }
  );
}

export function HEAD() {
  return new NextResponse(null, { status: 200 });
}
