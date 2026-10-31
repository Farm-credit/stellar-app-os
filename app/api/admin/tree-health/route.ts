import { NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/auth/admin';
import { HEALTH_ISSUES, type HealthIssueCode } from '@/lib/tree-health/classifier';
import {
  getTreeHealthAccuracy,
  listPendingTreeHealthReviews,
  retrainTreeHealthModel,
  saveTreeHealthCorrection,
} from '@/lib/tree-health/repository';

export const runtime = 'nodejs';

export async function GET() {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const [reviews, accuracy] = await Promise.all([
      listPendingTreeHealthReviews(),
      getTreeHealthAccuracy(),
    ]);
    return NextResponse.json(
      { reviews, accuracy },
      {
        headers: { 'Cache-Control': 'private, no-store' },
      }
    );
  } catch (error) {
    console.error('[admin/tree-health] GET failed:', error);
    return NextResponse.json({ error: 'Unable to load tree-health reviews' }, { status: 500 });
  }
}

/** Submit the field team's confirmed issue labels for one pending photo. */
export async function PATCH(request: Request) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const body = (await request.json()) as { predictionId?: unknown; correctedIssues?: unknown };
    const predictionId = Number(body.predictionId);
    const correctedIssues = body.correctedIssues;
    if (
      !Number.isSafeInteger(predictionId) ||
      predictionId < 1 ||
      !Array.isArray(correctedIssues)
    ) {
      return NextResponse.json(
        { error: 'predictionId and correctedIssues are required' },
        { status: 400 }
      );
    }
    if (!correctedIssues.every((code) => HEALTH_ISSUES.includes(code as HealthIssueCode))) {
      return NextResponse.json(
        { error: 'correctedIssues contains an unsupported issue code' },
        { status: 400 }
      );
    }
    const saved = await saveTreeHealthCorrection(
      predictionId,
      correctedIssues as HealthIssueCode[],
      'field-team'
    );
    if (!saved) {
      return NextResponse.json({ error: 'Review not found or already corrected' }, { status: 404 });
    }
    return NextResponse.json({ saved: true, accuracy: await getTreeHealthAccuracy() });
  } catch (error) {
    console.error('[admin/tree-health] PATCH failed:', error);
    return NextResponse.json({ error: 'Unable to save correction' }, { status: 500 });
  }
}

/** Trigger the quarter's model refresh from field-team corrections. */
export async function POST(request: Request) {
  const cronSecret = process.env.TREE_HEALTH_CRON_SECRET;
  const cronAuthorized = Boolean(
    cronSecret && request.headers.get('authorization') === `Bearer ${cronSecret}`
  );
  if (!cronAuthorized && !(await isAdminRequest())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const model = await retrainTreeHealthModel();
    return NextResponse.json({
      trained: true,
      version: model.version,
      quarter: model.version.match(/tree-health-(\d{4}-q\d)/i)?.[1] ?? null,
      sampleCount: model.sampleCount,
      accuracy: model.accuracy,
      evaluatedCount: model.evaluatedCount,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to retrain model';
    const status = /reviewed photos are required/.test(message) ? 422 : 500;
    console.error('[admin/tree-health] POST failed:', error);
    return NextResponse.json({ error: message }, { status });
  }
}
