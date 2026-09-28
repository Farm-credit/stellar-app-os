import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { revokeEmbedApiKey } from '@/backend/src/services/carbonOffsetApi';

type RouteContext = { params: Promise<{ keyId: string }> };

export async function DELETE(_request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { keyId } = await context.params;
    const revoked = await revokeEmbedApiKey(session.user.companyId, keyId);
    if (!revoked) return NextResponse.json({ error: 'API key not found' }, { status: 404 });

    return NextResponse.json({ revoked: true });
  } catch (error) {
    console.error('Revoke embed API key error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}