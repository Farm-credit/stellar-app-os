import { NextRequest, NextResponse } from 'next/server';
import { getEmbedPurchaseStatus, validateApiKey } from '@/backend/src/services/carbonOffsetApi';
import { isAllowedOrigin } from '@/backend/src/services/carbonOffsetSecurity';

type RouteContext = { params: Promise<{ sessionId: string }> };

export async function GET(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  try {
    const authorization = request.headers.get('authorization');
    const apiKey = authorization?.startsWith('Bearer ') ? authorization.slice(7) : '';
    const config = apiKey ? await validateApiKey(apiKey) : null;
    if (!config) return NextResponse.json({ error: 'Missing or invalid API key' }, { status: 401 });

    const origin = request.headers.get('origin');
    if (!isAllowedOrigin(origin, config.allowedDomains)) {
      return NextResponse.json({ error: 'Origin is not allowed for this API key' }, { status: 403 });
    }

    const { sessionId } = await context.params;
    const session = await getEmbedPurchaseStatus(sessionId, config.companyId, apiKey);
    if (!session) return NextResponse.json({ error: 'Purchase session not found' }, { status: 404 });

    return NextResponse.json({ session }, {
      headers: { 'Access-Control-Allow-Origin': origin!, Vary: 'Origin' },
    });
  } catch (error) {
    console.error('Get embed purchase status error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Max-Age': '600',
    },
  });
}