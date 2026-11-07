import { NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/auth/admin';
import { getSignedPrivateUrl } from '@/lib/aws/s3';
import { getPool } from '@/lib/db/client';

export const runtime = 'nodejs';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  if (!/^\d+$/.test(id)) {
    return NextResponse.json({ error: 'Invalid review id' }, { status: 400 });
  }
  try {
    const result = await getPool().query<{ photo_ref: string }>(
      'SELECT photo_ref FROM tree_health_predictions WHERE id = $1',
      [Number(id)]
    );
    const photoRef = result.rows[0]?.photo_ref;
    if (!photoRef) return NextResponse.json({ error: 'Photo not found' }, { status: 404 });
    if (photoRef.startsWith('planting-photos/')) {
      return NextResponse.redirect(await getSignedPrivateUrl(photoRef, 300), 302);
    }
    if (/^bafy[a-z2-7]{20,}$/.test(photoRef) || /^Qm[1-9A-HJ-NP-Za-km-z]{40,}$/.test(photoRef)) {
      return NextResponse.redirect(`https://ipfs.io/ipfs/${photoRef}`, 302);
    }
    return NextResponse.json({ error: 'Unsupported photo reference' }, { status: 404 });
  } catch (error) {
    console.error('[admin/tree-health/photo] failed:', error);
    return NextResponse.json({ error: 'Unable to access review photo' }, { status: 503 });
  }
}
