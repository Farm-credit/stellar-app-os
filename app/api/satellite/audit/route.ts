// Copyright 2024 Farm-credit Contributors
// Licensed under the Apache License, Version 2.0

/**
 * POST /api/satellite/audit
 *
 * Land Plot Audit: cross-checks a ground planting claim against Sentinel-2
 * NDVI vegetation density fetched from the Copernicus Statistical API.
 *
 * Request body (GroundPlantingClaim + optional options):
 *   plotId              string   (required)
 *   plotAreaHectares    number   (required, > 0)
 *   bounds              {north,south,east,west}  (or coordinates)
 *   coordinates         {latitude, longitude}   (or bounds)
 *   claimedStatus       'bare' | 'planted' | 'maintenance' | 'established'
 *   claimedAt           ISO-8601 date (required)
 *   claimedTreeCount?   number
 *   speciesSlug?        string
 *   windowDays?         number   (acquisition half-window, default 15)
 *   dateRange?          {from, to}  (overrides the window)
 *   cloudCoveragePercent? number (0–100)
 *
 * Response: { success: true, data: LandPlotAuditResult } | 422 validation | 500
 *
 * Returns verdicts of 'confirmed', 'disputed', or 'insufficient_data'. When
 * Copernicus credentials are not configured the endpoint still responds with an
 * 'insufficient_data' result rather than erroring, so the audit surface stays
 * available in every environment.
 */

import { type NextRequest, NextResponse } from 'next/server';

import {
  auditLandPlot,
  type ClaimedVegetationStatus,
  type GroundPlantingClaim,
} from '@/backend/src/services/satelliteVerification';

const VALID_STATUSES: readonly ClaimedVegetationStatus[] = [
  'bare',
  'planted',
  'maintenance',
  'established',
];

type ValidationError = { field: string; message: string };

function isValidNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isIsoDate(v: unknown): boolean {
  return typeof v === 'string' && !Number.isNaN(Date.parse(v));
}

function validateRequest(body: unknown): {
  data: { claim: GroundPlantingClaim; options: { windowDays?: number; dateRange?: { from: string; to: string }; cloudCoveragePercent?: number } } | null;
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

  if (typeof b.plotId !== 'string' || b.plotId.trim() === '') {
    errors.push({ field: 'plotId', message: 'plotId is required and must be a non-empty string.' });
  }

  if (!isValidNumber(b.plotAreaHectares) || (b.plotAreaHectares as number) <= 0) {
    errors.push({ field: 'plotAreaHectares', message: 'plotAreaHectares must be a positive number.' });
  }

  // Geometry: bounds XOR coordinates, at least one required.
  const hasBounds = b.bounds !== undefined;
  const hasCoords = b.coordinates !== undefined;
  if (!hasBounds && !hasCoords) {
    errors.push({
      field: 'bounds',
      message: 'Either bounds or coordinates is required to locate the plot.',
    });
  }
  if (hasBounds) {
    const bounds = b.bounds as Record<string, unknown>;
    if (
      !isValidNumber(bounds.north) ||
      !isValidNumber(bounds.south) ||
      !isValidNumber(bounds.east) ||
      !isValidNumber(bounds.west)
    ) {
      errors.push({
        field: 'bounds',
        message: 'bounds must include numeric north, south, east, west.',
      });
    } else if ((bounds.north as number) <= (bounds.south as number)) {
      errors.push({ field: 'bounds.north', message: 'bounds.north must exceed bounds.south.' });
    } else if ((bounds.east as number) <= (bounds.west as number)) {
      errors.push({ field: 'bounds.east', message: 'bounds.east must exceed bounds.west.' });
    }
  }
  if (hasCoords) {
    const coords = b.coordinates as Record<string, unknown>;
    if (!isValidNumber(coords.latitude) || Math.abs(coords.latitude as number) > 90) {
      errors.push({ field: 'coordinates.latitude', message: 'latitude must be in [-90, 90].' });
    }
    if (!isValidNumber(coords.longitude) || Math.abs(coords.longitude as number) > 180) {
      errors.push({ field: 'coordinates.longitude', message: 'longitude must be in [-180, 180].' });
    }
  }

  if (typeof b.claimedStatus !== 'string' || !VALID_STATUSES.includes(b.claimedStatus as ClaimedVegetationStatus)) {
    errors.push({
      field: 'claimedStatus',
      message: `claimedStatus must be one of: ${VALID_STATUSES.join(', ')}.`,
    });
  }

  if (!isIsoDate(b.claimedAt)) {
    errors.push({ field: 'claimedAt', message: 'claimedAt must be a valid ISO-8601 date.' });
  }

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

  if (b.speciesSlug !== undefined && typeof b.speciesSlug !== 'string') {
    errors.push({ field: 'speciesSlug', message: 'speciesSlug must be a string when provided.' });
  }

  const options: {
    windowDays?: number;
    dateRange?: { from: string; to: string };
    cloudCoveragePercent?: number;
  } = {};

  if (b.windowDays !== undefined) {
    if (!isValidNumber(b.windowDays) || (b.windowDays as number) <= 0) {
      errors.push({ field: 'windowDays', message: 'windowDays must be a positive number when provided.' });
    } else {
      options.windowDays = b.windowDays as number;
    }
  }

  if (b.dateRange !== undefined) {
    const dr = b.dateRange as Record<string, unknown>;
    if (!isIsoDate(dr.from) || !isIsoDate(dr.to)) {
      errors.push({
        field: 'dateRange',
        message: 'dateRange.from and dateRange.to must be valid ISO-8601 dates.',
      });
    } else {
      options.dateRange = { from: dr.from as string, to: dr.to as string };
    }
  }

  if (b.cloudCoveragePercent !== undefined) {
    if (
      !isValidNumber(b.cloudCoveragePercent) ||
      (b.cloudCoveragePercent as number) < 0 ||
      (b.cloudCoveragePercent as number) > 100
    ) {
      errors.push({
        field: 'cloudCoveragePercent',
        message: 'cloudCoveragePercent must be a number in [0, 100] when provided.',
      });
    } else {
      options.cloudCoveragePercent = b.cloudCoveragePercent as number;
    }
  }

  if (errors.length > 0) {
    return { data: null, errors };
  }

  const claim: GroundPlantingClaim = {
    plotId: b.plotId as string,
    plotAreaHectares: b.plotAreaHectares as number,
    ...(hasBounds ? { bounds: b.bounds as GroundPlantingClaim['bounds'] } : {}),
    ...(hasCoords ? { coordinates: b.coordinates as GroundPlantingClaim['coordinates'] } : {}),
    claimedStatus: b.claimedStatus as ClaimedVegetationStatus,
    claimedAt: b.claimedAt as string,
    ...(b.claimedTreeCount !== undefined ? { claimedTreeCount: b.claimedTreeCount as number } : {}),
    ...(typeof b.speciesSlug === 'string' ? { speciesSlug: b.speciesSlug } : {}),
  };

  return { data: { claim, options }, errors: [] };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON in request body.' },
      { status: 400 }
    );
  }

  const { data, errors } = validateRequest(body);
  if (errors.length > 0 || data === null) {
    return NextResponse.json(
      { success: false, error: 'Request validation failed.', validationErrors: errors },
      { status: 422 }
    );
  }

  try {
    const result = await auditLandPlot(data.claim, data.options);
    return NextResponse.json({ success: true, data: result }, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
    console.error('[satellite/audit] Land plot audit failed:', err);
    // Validation errors thrown by the service are client errors.
    const status = message.startsWith('Invalid land plot audit claim') ? 422 : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}

export function GET(): NextResponse {
  return NextResponse.json(
    {
      error: 'Method Not Allowed. Use POST to submit a land plot audit request.',
      allowedMethods: ['POST'],
    },
    { status: 405, headers: { Allow: 'POST' } }
  );
}
