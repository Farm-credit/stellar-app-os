import { NextResponse } from 'next/server';
import { renderPrometheusText } from '@/lib/metrics';

export function GET() {
  return new NextResponse(renderPrometheusText(), {
    status: 200,
    headers: { 'Content-Type': 'text/plain; version=0.0.4; charset=utf-8' },
  });
}
