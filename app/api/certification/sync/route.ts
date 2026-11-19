import { NextRequest, NextResponse } from 'next/server';
import { certificationSyncService } from '@/lib/services/certification-sync-service';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';

interface SyncRequestBody {
  projectId?: string;
  provider?: 'verra' | 'gold-standard';
  force?: boolean;
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    let body: SyncRequestBody = {};
    try {
      body = (await request.json()) as SyncRequestBody;
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON body' },
        { status: 400 }
      );
    }

    const { projectId, provider, force } = body;

    if (!projectId || typeof projectId !== 'string') {
      return NextResponse.json(
        { error: 'projectId is required' },
        { status: 400 }
      );
    }

    if (provider && provider !== 'verra' && provider !== 'gold-standard') {
      return NextResponse.json(
        { error: 'provider must be either "verra" or "gold-standard"' },
        { status: 400 }
      );
    }

    const result = await certificationSyncService.syncProject({
      projectId,
      provider,
      force: Boolean(force),
      requestedBy: session.user.id ?? session.user.email ?? 'unknown',
    });

    return NextResponse.json(
      {
        success: true,
        data: result,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[certification/sync] POST failed:', error);
    const message =
      error instanceof Error ? error.message : 'Failed to sync certification data';
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed. Use POST to trigger a certification sync.' },
    { status: 405 }
  );
}