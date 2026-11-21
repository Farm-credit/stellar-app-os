/**
 * GET   /api/partners/:partnerId/config — current white-label configuration
 * PATCH /api/partners/:partnerId/config — update branding (colours, logo,
 *         domain) and the platform fee / partner margin split. (#1713)
 *
 * Responses:
 *   200  { config }
 *   400  { error } — validation failure
 *   404  { error: "Partner not found" }
 */

import { type NextRequest, NextResponse } from 'next/server';
import {
  getWhiteLabelConfig,
  isValidHexColor,
  validateFees,
  type WhiteLabelConfig,
} from '@/lib/whiteLabel';

export const runtime = 'nodejs';

interface PatchBody {
  branding?: Partial<WhiteLabelConfig['branding']>;
  fees?: Partial<WhiteLabelConfig['fees']>;
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ partnerId: string }> }
) {
  const { partnerId } = await params;
  const config = getWhiteLabelConfig(partnerId);
  if (!config) return jsonError('Partner not found', 404);
  return NextResponse.json({ config });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ partnerId: string }> }
) {
  const { partnerId } = await params;
  const config = getWhiteLabelConfig(partnerId);
  if (!config) return jsonError('Partner not found', 404);

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return jsonError('Request body must be JSON', 400);
  }

  const errors: string[] = [];

  if (body.branding) {
    for (const key of ['primaryColor', 'accentColor', 'backgroundColor'] as const) {
      const value = body.branding[key];
      if (value !== undefined && !isValidHexColor(value)) {
        errors.push(`${key} must be a hex color like #1d4ed8`);
      }
    }
    if (
      body.branding.customDomain !== undefined &&
      !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(body.branding.customDomain.trim())
    ) {
      errors.push('customDomain must be a valid hostname');
    }
    if (body.branding.logoUrl !== undefined && !/^https?:\/\//i.test(body.branding.logoUrl)) {
      errors.push('logoUrl must be an https URL');
    }
  }

  const nextFees = { ...config.fees, ...(body.fees ?? {}) };
  if (body.fees) {
    errors.push(...validateFees(nextFees));
  }

  if (errors.length > 0) {
    return jsonError(errors.join('; '), 400);
  }

  if (body.branding) {
    Object.assign(config.branding, body.branding);
  }
  if (body.fees) {
    Object.assign(config.fees, body.fees);
  }

  return NextResponse.json({ config });
}
