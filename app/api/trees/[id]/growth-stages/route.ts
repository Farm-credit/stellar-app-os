/**
 * Tree growth stages & chronological field-team photo timeline API.
 *
 * GET  /api/trees/:id/growth-stages
 *   Returns the tree's current growth stage, chronological photo timeline, and
 *   sponsor stage-transition notifications.
 *
 * POST /api/trees/:id/growth-stages
 *   Records a field-team uploaded photo for a growth stage (sapling, juvenile, mature).
 *   When the tree transitions to a new growth stage, emits a sponsor notification.
 */
import { type NextRequest, NextResponse } from 'next/server';
import { getMockTrees } from '@/lib/api/mock/trees';
import {
  getTreeGrowthStageTimeline,
  isValidGrowthStage,
  uploadGrowthStagePhoto,
} from '@/lib/tree-growth/stages';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{ id: string }>;
}

function findTree(id: string) {
  return getMockTrees().find((t) => t.id === id || t.treeId === id);
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const tree = findTree(id);
  const timeline = getTreeGrowthStageTimeline(tree?.id ?? id, tree);

  return NextResponse.json(
    {
      success: true,
      ...timeline,
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON body' },
      { status: 400 }
    );
  }

  const { stage, imageUrl, uploadedBy, caption, heightCm, uploadedAt, sponsorId } = body;

  if (!isValidGrowthStage(stage)) {
    return NextResponse.json(
      {
        success: false,
        error: 'Invalid growth stage. Must be one of: sapling, juvenile, mature.',
      },
      { status: 400 }
    );
  }

  if (typeof imageUrl !== 'string' || imageUrl.trim().length === 0) {
    return NextResponse.json(
      { success: false, error: 'imageUrl is required.' },
      { status: 400 }
    );
  }

  if (typeof uploadedBy !== 'string' || uploadedBy.trim().length === 0) {
    return NextResponse.json(
      { success: false, error: 'uploadedBy (field team name) is required.' },
      { status: 400 }
    );
  }

  if (heightCm !== undefined && (typeof heightCm !== 'number' || !Number.isFinite(heightCm) || heightCm < 0)) {
    return NextResponse.json(
      { success: false, error: 'heightCm must be a non-negative number.' },
      { status: 400 }
    );
  }

  const tree = findTree(id);
  const result = uploadGrowthStagePhoto(
    {
      treeId: tree?.id ?? id,
      stage,
      imageUrl,
      uploadedBy,
      caption: typeof caption === 'string' ? caption : undefined,
      heightCm: typeof heightCm === 'number' ? heightCm : undefined,
      uploadedAt: typeof uploadedAt === 'string' ? uploadedAt : undefined,
      sponsorId: typeof sponsorId === 'string' ? sponsorId : undefined,
    },
    tree
  );

  return NextResponse.json(
    {
      success: true,
      ...result,
    },
    { status: 201 }
  );
}
