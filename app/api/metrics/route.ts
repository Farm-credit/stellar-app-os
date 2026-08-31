import { NextResponse } from 'next/server';
import { renderPrometheusText } from '@/lib/metrics';

export async function GET() {
  const metrics = await renderPrometheusText();
  return new NextResponse(metrics, {
    status: 200,
    headers: { 'Content-Type': 'text/plain; version=0.0.4; charset=utf-8' },
  });
}
