/**
 * POST /api/survival/batch-predict
 *
 * Runs survival predictions for multiple planting sites in one request (#1156).
 * Useful for pre-screening large sponsored batches before committing to escrow.
 *
 * Limit: 100 items per batch to prevent abuse.
 *
 * Body: SurvivalBatchPredictRequest
 * Response: SurvivalBatchPredictResponse
 */

import { NextResponse } from 'next/server';
import { predictSurvivalProbability } from '@/lib/survival/survival-model';
import type {
  SurvivalBatchPredictRequest,
  SurvivalBatchPredictResponse,
  SurvivalPredictResponse,
} from '@/lib/types/survival-model';

export const runtime = 'nodejs';

const MAX_BATCH_SIZE = 100;

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await (request as Request & { json(): Promise<unknown> }).json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Request body must be a JSON object' }, { status: 400 });
  }

  const { predictions } = body as SurvivalBatchPredictRequest;

  if (!Array.isArray(predictions) || predictions.length === 0) {
    return NextResponse.json(
      { error: 'predictions must be a non-empty array' },
      { status: 400 }
    );
  }

  if (predictions.length > MAX_BATCH_SIZE) {
    return NextResponse.json(
      { error: `Batch size exceeds maximum of ${MAX_BATCH_SIZE}` },
      { status: 400 }
    );
  }

  try {
    const results: SurvivalPredictResponse[] = predictions.map((input, idx) => {
      if (!input || typeof input !== 'object') {
        throw new Error(`predictions[${idx}] must be an object`);
      }
      if (!input.speciesSlug || !input.biome || !input.regionKey) {
        throw new Error(`predictions[${idx}] missing required fields: speciesSlug, biome, regionKey`);
      }

      const prediction = predictSurvivalProbability(input);
      return {
        ...prediction,
        speciesSlug: input.speciesSlug,
        regionKey: input.regionKey,
      };
    });

    const response: SurvivalBatchPredictResponse = {
      results,
      batchSize: results.length,
      processedAt: new Date().toISOString(),
    };

    return NextResponse.json(response, { status: 200 });
  } catch (err) {
    console.error('[api/survival/batch-predict] Error:', err);
    const message = err instanceof Error ? err.message : 'Batch prediction failed';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
