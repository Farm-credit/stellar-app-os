import { getPool } from '@/lib/db/client';
import type {
  HealthIssueCode,
  TreeHealthModel,
  TreeHealthPrediction,
  TreeHealthTrainingExample,
  VisionLabel,
} from '@/lib/tree-health/classifier';
import { HEALTH_ISSUES, trainTreeHealthModel } from '@/lib/tree-health/classifier';

export interface StoredTreeHealthPrediction {
  id: number;
  tree_ref: string;
  photo_ref: string;
  predicted_issues: TreeHealthPrediction['issues'];
  confidence: number;
  provider: TreeHealthPrediction['provider'];
  model_version: string;
  review_status: 'pending' | 'corrected';
  created_at: string;
}

export async function getActiveTreeHealthModel(): Promise<TreeHealthModel | null> {
  const result = await getPool().query<{ model_json: TreeHealthModel }>(
    `SELECT model_json FROM tree_health_models WHERE active = TRUE ORDER BY created_at DESC LIMIT 1`
  );
  return result.rows[0]?.model_json ?? null;
}

export async function saveTreeHealthPrediction(input: {
  treeRef: string;
  photoRef: string;
  features: VisionLabel[];
  prediction: TreeHealthPrediction;
}): Promise<number> {
  const result = await getPool().query<{ id: number }>(
    `INSERT INTO tree_health_predictions
       (tree_ref, photo_ref, vision_features, predicted_issues, confidence, provider, model_version)
     VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, $6, $7)
     RETURNING id`,
    [
      input.treeRef,
      input.photoRef,
      JSON.stringify(input.features),
      JSON.stringify(input.prediction.issues),
      input.prediction.confidence,
      input.prediction.provider,
      input.prediction.modelVersion,
    ]
  );
  return result.rows[0].id;
}

export async function getTreeHealthHistory(treeRef: string): Promise<StoredTreeHealthPrediction[]> {
  const result = await getPool().query<StoredTreeHealthPrediction>(
    `SELECT id, tree_ref, photo_ref, predicted_issues, confidence, provider, model_version,
            review_status, created_at
       FROM tree_health_predictions
      WHERE tree_ref = $1
      ORDER BY created_at DESC
      LIMIT 25`,
    [treeRef]
  );
  return result.rows;
}

export async function listPendingTreeHealthReviews(
  limit = 50
): Promise<StoredTreeHealthPrediction[]> {
  const result = await getPool().query<StoredTreeHealthPrediction>(
    `SELECT id, tree_ref, photo_ref, predicted_issues, confidence, provider, model_version,
            review_status, created_at
       FROM tree_health_predictions
      WHERE review_status = 'pending'
      ORDER BY created_at ASC
      LIMIT $1`,
    [Math.max(1, Math.min(100, limit))]
  );
  return result.rows;
}

export async function saveTreeHealthCorrection(
  predictionId: number,
  correctedIssues: HealthIssueCode[],
  reviewer: string
): Promise<boolean> {
  const result = await getPool().query(
    `UPDATE tree_health_predictions
        SET corrected_issues = $2::jsonb,
            review_status = 'corrected',
            reviewed_by = $3,
            reviewed_at = NOW()
      WHERE id = $1 AND review_status = 'pending'`,
    [predictionId, JSON.stringify(correctedIssues), reviewer]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function getTreeHealthAccuracy(): Promise<{
  reviewedCount: number;
  exactMatchAccuracy: number | null;
  latestModel: {
    version: string;
    accuracy: number | null;
    sampleCount: number;
    evaluatedCount: number;
    trainedAt: string;
  } | null;
}> {
  const [reviewed, latest] = await Promise.all([
    getPool().query<{
      predicted_issues: { code: HealthIssueCode }[];
      corrected_issues: HealthIssueCode[];
    }>(
      `SELECT predicted_issues, corrected_issues
         FROM tree_health_predictions
        WHERE review_status = 'corrected' AND corrected_issues IS NOT NULL`
    ),
    getPool().query<{ model_json: TreeHealthModel }>(
      `SELECT model_json FROM tree_health_models ORDER BY created_at DESC LIMIT 1`
    ),
  ]);
  const rows = reviewed.rows;
  const exactMatches = rows.filter((row) => {
    const predicted = new Set((row.predicted_issues ?? []).map((issue) => issue.code));
    const corrected = new Set(row.corrected_issues ?? []);
    return HEALTH_ISSUES.every((code) => predicted.has(code) === corrected.has(code));
  }).length;
  const model = latest.rows[0]?.model_json;
  return {
    reviewedCount: rows.length,
    exactMatchAccuracy: rows.length ? exactMatches / rows.length : null,
    latestModel: model
      ? {
          version: model.version,
          accuracy: model.accuracy,
          sampleCount: model.sampleCount,
          evaluatedCount: model.evaluatedCount,
          trainedAt: model.trainedAt,
        }
      : null,
  };
}

export function currentQuarterKey(date = new Date()): string {
  return `${date.getUTCFullYear()}-Q${Math.floor(date.getUTCMonth() / 3) + 1}`;
}

export async function retrainTreeHealthModel(date = new Date()): Promise<TreeHealthModel> {
  const quarter = currentQuarterKey(date);
  const result = await getPool().query<{
    vision_features: VisionLabel[];
    corrected_issues: HealthIssueCode[];
  }>(
    `SELECT vision_features, corrected_issues
       FROM tree_health_predictions
      WHERE review_status = 'corrected' AND corrected_issues IS NOT NULL
      ORDER BY reviewed_at ASC, id ASC`
  );
  const examples: TreeHealthTrainingExample[] = result.rows.map((row) => ({
    features: (row.vision_features ?? []).map((feature) => feature.name),
    correctedIssues: (row.corrected_issues ?? []).filter((code) =>
      (HEALTH_ISSUES as readonly string[]).includes(code)
    ),
  }));
  const version = `tree-health-${quarter.toLowerCase()}-${Date.now()}`;
  const model = trainTreeHealthModel(examples, version, date.toISOString());
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query(`UPDATE tree_health_models SET active = FALSE WHERE active = TRUE`);
    await client.query(
      `INSERT INTO tree_health_models (version, quarter, model_json, sample_count, accuracy, active)
       VALUES ($1, $2, $3::jsonb, $4, $5, TRUE)
       ON CONFLICT (quarter) DO UPDATE
         SET version = EXCLUDED.version,
             model_json = EXCLUDED.model_json,
             sample_count = EXCLUDED.sample_count,
             accuracy = EXCLUDED.accuracy,
             active = TRUE,
             created_at = NOW()`,
      [version, quarter, JSON.stringify(model), model.sampleCount, model.accuracy]
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  return model;
}
