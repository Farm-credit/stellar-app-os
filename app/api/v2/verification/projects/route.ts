/**
 * GET /api/v2/verification/projects — Issue #1383
 *
 * Lists registered Verra (VCS) and Gold Standard carbon projects
 * with methodology, active approval status, and credit capacity.
 */

import { NextResponse } from 'next/server';
import { apiVersionHeaders } from '@/lib/api/versioning';
import { getRegisteredProtocolProjects } from '@/lib/api/protocol-verification';

export const runtime = 'nodejs';

function responseHeaders(): Record<string, string> {
  return {
    'Cache-Control': 'public, max-age=60',
    ...(apiVersionHeaders('v2') as Record<string, string>),
  };
}

export async function GET(): Promise<NextResponse> {
  try {
    const projects = await getRegisteredProtocolProjects();
    return NextResponse.json({ projects }, { headers: responseHeaders() });
  } catch (error) {
    console.error('[api/v2/verification/projects] error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: responseHeaders() }
    );
  }
}
