import { type NextRequest, NextResponse } from 'next/server';
import { verifyPlanterJwt } from '@/lib/auth/jwt';
import { getSignedPrivateUrl } from '@/lib/aws/s3';

export const runtime = 'nodejs';

interface SecureLinkBody {
  s3Key: string;
  expiresIn?: number;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Get authorization header
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Authorization header with Bearer token is required' },
        { status: 401 }
      );
    }

    // Verify JWT
    const token = authHeader.slice(7);
    const payload = await verifyPlanterJwt(token);
    if (!payload) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
    }

    // Parse and validate request body
    let body: Partial<SecureLinkBody>;
    try {
      body = (await request.json()) as Partial<SecureLinkBody>;
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { s3Key, expiresIn } = body;
    if (!s3Key) {
      return NextResponse.json({ error: 's3Key is required' }, { status: 400 });
    }

    // Generate signed URL
    const signedUrl = await getSignedPrivateUrl(s3Key, expiresIn);

    return NextResponse.json({ signedUrl });
  } catch (error) {
    console.error('[certificate/secure-link] error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
