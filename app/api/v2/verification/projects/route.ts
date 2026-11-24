/**
 * GET /api/v2/verification/projects — Issue #1383
 *
 * Lists registered Verra (VCS) and Gold Standard carbon projects
 * with methodology, active approval status, and credit capacity.
 */

import { type NextRequest, NextResponse } from 'next/server';
import { apiVersionHeaders } from '@/lib/api/versioning';
import { getRegisteredProtocolProjects, type ProtocolType } from '@/lib/api/protocol-verification';

export const runtime = 'nodejs';

function responseHeaders(): Record<string, string> {
  return {
    'Cache-Control': 'public, max-age=60',
    ...(apiVersionHeaders('v2') as Record<string, string>),
  };
}

const PROTOCOLS: Record<string, ProtocolType> = {
  verra: 'Verra (VCS)',
  vcs: 'Verra (VCS)',
  'gold-standard': 'Gold Standard',
  gs: 'Gold Standard',
};

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const params = request.nextUrl.searchParams;
    const protocolParam = params.get('protocol')?.toLowerCase();
    if (protocolParam && !PROTOCOLS[protocolParam]) {
      return NextResponse.json(
        { error: 'protocol must be one of: verra, vcs, gold-standard, gs.' },
        { status: 400, headers: responseHeaders() }
      );
    }
    const projects = await getRegisteredProtocolProjects({
      protocol: protocolParam ? PROTOCOLS[protocolParam] : undefined,
      country: params.get('country') ?? undefined,
      activeOnly: params.get('active') === 'true',
    });
    return NextResponse.json({ projects }, { headers: responseHeaders() });
  } catch (error) {
    console.error('[api/v2/verification/projects] error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: responseHeaders() }
    );
  }
}
