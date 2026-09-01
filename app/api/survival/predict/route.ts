/**
 * POST /api/survival/predict
 *
 * Predicts the probability that a tree survives to its first annual
 * verification milestone given species, region, climate, soil, and
 * historical data (#1156).
 *
 * Body: SurvivalPredictRequest (lib/types/survival-model.ts)
 *
 * Response: SurvivalPredictResponse with:
 *   - survivalProbability (0.0 – 1.0)
 *   - survivalPercent (0 – 100)
 *   - confidence: 'high' | 'medium' | 'low'
 *   - featureImportance (per-feature scores)
 *   - riskFactors (human-readable list of risk signals)
 *   - modelVersion
 */

import { NextResponse } from 'next/server';
import { predictSurvivalProbability } from '@/lib/survival/survival-model';
import type { SurvivalPredictRequest, SurvivalPredictResponse } from '@/lib/types/survival-model';

export const runtime = 'nodejs';

// ── Validation ────────────────────────────────────────────────────────────────

const VALID_SOIL_TEXTURES = [
  'clay', 'silty-clay', 'clay-loam', 'silt-loam',
  'loam', 'sandy-loam', 'loamy-sand', 'sand',
];

function validateRequest(body: unknown): string | null {
  if (!body || typeof body !== 'object') return 'Request body must be a JSON object';

  const b = body as Record<string, unknown>;

  if (typeof b.speciesSlug !== 'string' || !b.speciesSlug.trim())
    return 'speciesSlug is required';
  if (typeof b.biome !== 'string' || !b.biome.trim())
    return 'biome is required';
  if (typeof b.regionKey !== 'string' || !b.regionKey.trim())
    return 'regionKey is required';
  if (typeof b.plantingDate !== 'string' || isNaN(new Date(b.plantingDate).getTime()))
    return 'plantingDate must be a valid ISO-8601 date';

  // climate
  const climate = b.climate as Record<string, unknown>;
  if (!climate || typeof climate !== 'object') return 'climate object is required';
  if (typeof climate.annualRainfallMm !== 'number' || climate.annualRainfallMm < 0)
    return 'climate.annualRainfallMm must be a non-negative number';
  if (typeof climate.meanTemperatureC !== 'number')
    return 'climate.meanTemperatureC is required';
  if (typeof climate.drySeasonMonths !== 'number' || climate.drySeasonMonths < 0 || climate.drySeasonMonths > 12)
    return 'climate.drySeasonMonths must be between 0 and 12';

  // soil
  const soil = b.soil as Record<string, unknown>;
  if (!soil || typeof soil !== 'object') return 'soil object is required';
  if (typeof soil.organicMatterPercent !== 'number' || soil.organicMatterPercent < 0)
    return 'soil.organicMatterPercent must be a non-negative number';
  if (typeof soil.ph !== 'number' || soil.ph < 3 || soil.ph > 10)
    return 'soil.ph must be between 3 and 10';
  if (typeof soil.waterHoldingCapacityMm !== 'number' || soil.waterHoldingCapacityMm < 0)
    return 'soil.waterHoldingCapacityMm must be a non-negative number';
  if (!VALID_SOIL_TEXTURES.includes(soil.texture as string))
    return `soil.texture must be one of: ${VALID_SOIL_TEXTURES.join(', ')}`;

  return null;
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await (request as Request & { json(): Promise<unknown> }).json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const validationError = validateRequest(body);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const req = body as SurvivalPredictRequest;

  try {
    const prediction = predictSurvivalProbability(req);

    const response: SurvivalPredictResponse = {
      ...prediction,
      speciesSlug: req.speciesSlug,
      regionKey: req.regionKey,
    };

    return NextResponse.json(response, { status: 200 });
  } catch (err) {
    console.error('[api/survival/predict] Error:', err);
    const message = err instanceof Error ? err.message : 'Prediction failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
