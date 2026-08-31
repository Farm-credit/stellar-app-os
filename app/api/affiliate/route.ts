import { NextResponse } from 'next/server';
import { getMockAffiliateProgram } from '@/lib/api/mock/affiliateProgram';

export const runtime = 'nodejs';

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? '').split(',').map(s => s.trim()).filter(Boolean);

function getCorsHeaders(request: Request) {
  const origin = request.headers.get('origin');
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    return {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    };
  }
  return {};
}

/**
 * GET /api/affiliate
 */
export function GET(request: Request) {
  return NextResponse.json(getMockAffiliateProgram(), { headers: getCorsHeaders(request) });
}

/**
 * OPTIONS /api/affiliate
 */
export function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: getCorsHeaders(request) });
}
