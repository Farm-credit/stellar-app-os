/**
 * POST /api/satellite/verify
 *
 * Performs real-time satellite-data environmental verification for a plot,
 * combining NDVI/vegetation health, tree-count estimation, and land-cover
 * change detection.
 *
 * This endpoint is synchronous (no job queue needed) because all computations
 * are pure calculations on supplied spectral band values — no external API
 * calls are made. The caller is responsible for fetching satellite imagery and
 * extracting band reflectance values before calling this endpoint.
 *
 * Request body: SatelliteVerificationRequest (see lib/satellite/types.ts)
 * Response:     SatelliteVerificationResult
 */

import { NextRequest, NextResponse } from 'next/server';

import { verifySatelliteData } from '@/lib/satellite/verifier';
import type { SatelliteVerificationRequest } from '@/lib/satellite/types';

// ── Input validation ──────────────────────────────────────────────────────────

function isValidNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isValidFraction(v: unknown): v is number {
  return isValidNumber(v) && (v as number) >= 0 && (v as number) <= 1;
}

type ValidationError = { field: string; message: string };

function validateRequest(body: unknown): {
  data: SatelliteVerificationRequest | null;
  errors: ValidationError[];
} {
  const errors: ValidationError[] = [];

  if (typeof body !== 'object' || body === null) {
    return {
      data: null,
      errors: [{ field: 'body', message: 'Request body must be a JSON object.' }],
    };
  }

  const b = body as Record<string, unknown>;

  // Required top-level fields
  if (typeof b.plotId !== 'string' || b.plotId.trim() === '') {
    errors.push({ field: 'plotId', message: 'plotId is required and must be a non-empty string.' });
  }

  if (typeof b.plotAreaHectares !== 'number' || b.plotAreaHectares <= 0) {
    errors.push({
      field: 'plotAreaHectares',
      message: 'plotAreaHectares must be a positive number.',
    });
  }

  // Coordinates
  const coords = b.coordinates as Record<string, unknown> | undefined;
  if (!coords || typeof coords !== 'object') {
    errors.push({ field: 'coordinates', message: 'coordinates object is required.' });
  } else {
    if (!isValidNumber(coords.latitude) || Math.abs(coords.latitude as number) > 90) {
      errors.push({ field: 'coordinates.latitude', message: 'latitude must be in [-90, 90].' });
    }
    if (!isValidNumber(coords.longitude) || Math.abs(coords.longitude as number) > 180) {
      errors.push({
        field: 'coordinates.longitude',
        message: 'longitude must be in [-180, 180].',
      });
    }
  }

  // Current spectral bands (red + nir required)
  const bands = b.currentBands as Record<string, unknown> | undefined;
  if (!bands || typeof bands !== 'object') {
    errors.push({ field: 'currentBands', message: 'currentBands object is required.' });
  } else {
    if (!isValidFraction(bands.red)) {
      errors.push({
        field: 'currentBands.red',
        message: 'currentBands.red must be a number in [0, 1].',
      });
    }
    if (!isValidFraction(bands.nir)) {
      errors.push({
        field: 'currentBands.nir',
        message: 'currentBands.nir must be a number in [0, 1].',
      });
    }
    // Optional bands — validate only if present
    for (const opt of ['blue', 'green', 'swir1', 'swir2', 'redEdge1'] as const) {
      if (bands[opt] !== undefined && !isValidFraction(bands[opt])) {
        errors.push({
          field: `currentBands.${opt}`,
          message: `currentBands.${opt} must be a number in [0, 1] when provided.`,
        });
      }
    }
  }

  // Imagery metadata
  const meta = b.imageryMetadata as Record<string, unknown> | undefined;
  if (!meta || typeof meta !== 'object') {
    errors.push({ field: 'imageryMetadata', message: 'imageryMetadata object is required.' });
  } else {
    if (!isValidNumber(meta.resolutionMetersPerPixel) || (meta.resolutionMetersPerPixel as number) <= 0) {
      errors.push({
        field: 'imageryMetadata.resolutionMetersPerPixel',
        message: 'resolutionMetersPerPixel must be a positive number.',
      });
    }
    if (!isValidNumber(meta.plotAreaHectares) || (meta.plotAreaHectares as number) <= 0) {
      errors.push({
        field: 'imageryMetadata.plotAreaHectares',
        message: 'imageryMetadata.plotAreaHectares must be a positive number.',
      });
    }
    if (!isValidFraction(meta.canopyCoverFraction)) {
      errors.push({
        field: 'imageryMetadata.canopyCoverFraction',
        message: 'canopyCoverFraction must be a number in [0, 1].',
      });
    }
  }

  // Claimed tree count (optional, must be a positive integer if provided)
  if (b.claimedTreeCount !== undefined) {
    if (
      typeof b.claimedTreeCount !== 'number' ||
      !Number.isInteger(b.claimedTreeCount) ||
      (b.claimedTreeCount as number) < 0
    ) {
      errors.push({
        field: 'claimedTreeCount',
        message: 'claimedTreeCount must be a non-negative integer when provided.',
      });
    }
  }

  if (errors.length > 0) {
    return { data: null, errors };
  }

  return {
    data: b as unknown as SatelliteVerificationRequest,
    errors: [],
  };
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: 'Invalid JSON in request body.',
      },
      { status: 400 }
    );
  }

  const { data, errors } = validateRequest(body);

  if (errors.length > 0) {
    return NextResponse.json(
      {
        success: false,
        error: 'Request validation failed.',
        validationErrors: errors,
      },
      { status: 422 }
    );
  }

  // data is guaranteed non-null here (validated above)
  const verificationRequest = data!;

  try {
    const result = verifySatelliteData(verificationRequest);

    return NextResponse.json(
      {
        success: true,
        data: result,
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
    console.error('[satellite/verify] Verification failed:', err);
    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status: 500 }
    );
  }
}

// Only POST is supported for this resource
export function GET(): NextResponse {
  return NextResponse.json(
    {
      error: 'Method Not Allowed. Use POST to submit a verification request.',
      allowedMethods: ['POST'],
    },
    {
      status: 405,
      headers: { Allow: 'POST' },
    }
  );
}
