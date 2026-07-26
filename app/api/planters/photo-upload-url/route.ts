import { randomUUID } from 'node:crypto';
import { type NextRequest, NextResponse } from 'next/server';
import { verifyPlanterJwt } from '@/lib/auth/jwt';
import { createPhotoUploadUrl, getPhotoExtension } from '@/lib/aws/s3';
import logger from '@/lib/logger';

export const runtime = 'nodejs';
const MAX_SIZE = 5 * 1024 * 1024;
const TREE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

interface UploadBody {
  treeId: string;
  contentType: string;
  contentLength: number;
}

function expirySeconds(): number {
  const value = Number(process.env.S3_UPLOAD_URL_EXPIRES_IN_SECONDS);
  return Number.isInteger(value) ? Math.min(900, Math.max(60, value)) : 300;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Bearer authentication is required' }, { status: 401 });
  }

  const planter = await verifyPlanterJwt(authorization.slice(7));
  if (!planter?.sub || planter.role !== 'planter') {
    return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
  }

  let body: Partial<UploadBody>;
  try {
    body = (await request.json()) as Partial<UploadBody>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { treeId, contentType, contentLength } = body;
  if (!treeId || !TREE_ID.test(treeId)) {
    return NextResponse.json({ error: 'treeId is invalid' }, { status: 400 });
  }
  const extension = contentType ? getPhotoExtension(contentType) : undefined;
  if (!extension) {
    return NextResponse.json(
      { error: 'contentType must be image/jpeg, image/png, or image/webp' },
      { status: 415 }
    );
  }
  if (
    typeof contentLength !== 'number' ||
    !Number.isSafeInteger(contentLength) ||
    contentLength < 1
  ) {
    return NextResponse.json(
      { error: 'contentLength must be a positive integer' },
      { status: 400 }
    );
  }
  if (contentLength > MAX_SIZE) {
    return NextResponse.json({ error: 'Photo exceeds the 5 MB limit' }, { status: 413 });
  }

  const expiresIn = expirySeconds();
  const key = `tree-photo-evidence/${planter.sub}/${treeId}/${randomUUID()}.${extension}`;
  try {
    const uploadUrl = await createPhotoUploadUrl({ key, contentType, contentLength, expiresIn });
    logger.info('Created tree photo upload URL', { treeId, planter: planter.sub, key, expiresIn });
    return NextResponse.json(
      {
        uploadUrl,
        key,
        expiresIn,
        method: 'PUT',
        headers: { 'Content-Type': contentType, 'Content-Length': String(contentLength) },
      },
      { headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } }
    );
  } catch (error) {
    logger.error('Failed to create tree photo upload URL', {
      treeId,
      planter: planter.sub,
      error: error instanceof Error ? error.message : 'unknown error',
    });
    return NextResponse.json({ error: 'Photo upload is temporarily unavailable' }, { status: 503 });
  }
}
