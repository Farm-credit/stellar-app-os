/**
 * POST /api/v1/compliance/regulatory
 *
 * Buyer compliance reporting for SEC, EPA, and carbon-tax regulatory
 * requirements — Issue #1373.
 *
 * Accepts a buyer's gross emissions, verified carbon offset tonnes, and
 * optional offset positions, then automatically calculates the net
 * emissions position and returns structured filing payloads for each
 * requested compliance regime.
 *
 * Request body (JSON):
 * {
 *   buyerId:               string  (required)
 *   companyName?:          string
 *   reportingPeriodStart:  string  ISO date YYYY-MM-DD  (required)
 *   reportingPeriodEnd:    string  ISO date YYYY-MM-DD  (required)
 *   reportingYear?:        number  (YYYY)
 *   emissionsTonnes:       number  >= 0  (required)
 *   offsetsTonnes:         number  >= 0  (required)
 *   offsetSources?:        string[]
 *   carbonTaxRate?:        number  USD/tonne (overrides jurisdiction default)
 *   jurisdiction?:         string
 *   state?:                string  US state abbreviation for tax-rate lookup
 *   facilityId?:           string  EPA Part 98 facility ID
 *   regimes?:              ('SEC'|'EPA'|'CARBON_TAX')[]  (default: all three)
 *   offsetPositions?:      OffsetPosition[]
 * }
 *
 * Response 201:
 * {
 *   bundle: RegulatoryFilingBundle
 * }
 *
 * GET /api/v1/compliance/regulatory
 *
 * Returns the list of previously generated regulatory reports scoped to
 * a buyerId.
 *
 * Query params:
 *   buyerId  (optional) — filter by buyer
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import type { ComplianceRegime } from '@/lib/types/compliance-report';
import {
  generateRegulatoryBundle,
  type RegulatoryFilingInput,
  type OffsetPosition,
} from '@/lib/services/regulatory-compliance';
import { listComplianceReports } from '@/lib/services/compliance-reporting';

export const runtime = 'nodejs';

// ─── Validation schema ────────────────────────────────────────────────────────

const isoDate = z
  .string()
  .refine((v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), {
    message: 'must be an ISO date (YYYY-MM-DD)',
  });

const nonNeg = z.number().finite().min(0);

const offsetPositionSchema = z.object({
  creditId: z.string().min(1),
  standard: z.string().min(1),
  tonnes: nonNeg,
  status: z.enum(['active', 'retired']),
  vintageYear: z.number().int().min(2000).max(2100),
});

const VALID_REGIMES = ['SEC', 'EPA', 'CARBON_TAX'] as const;

const regulatoryRequestSchema = z
  .object({
    buyerId: z.string().min(1, 'buyerId is required').max(128),
    companyName: z.string().max(256).optional(),
    reportingPeriodStart: isoDate,
    reportingPeriodEnd: isoDate,
    reportingYear: z.number().int().min(2000).max(2100).optional(),
    emissionsTonnes: nonNeg,
    offsetsTonnes: nonNeg,
    offsetSources: z.array(z.string().min(1)).optional(),
    carbonTaxRate: nonNeg.optional(),
    jurisdiction: z.string().max(128).optional(),
    state: z.string().max(2).optional(),
    facilityId: z.string().max(64).optional(),
    regimes: z.array(z.enum(VALID_REGIMES)).min(1).optional(),
    offsetPositions: z.array(offsetPositionSchema).optional(),
  })
  .refine((d) => d.reportingPeriodEnd > d.reportingPeriodStart, {
    message: 'reportingPeriodEnd must be after reportingPeriodStart',
    path: ['reportingPeriodEnd'],
  });

// ─── Handlers ─────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const buyerId = request.nextUrl.searchParams.get('buyerId') ?? undefined;
    const reports = listComplianceReports(buyerId);
    return NextResponse.json({ reports });
  } catch (error) {
    console.error('[v1/compliance/regulatory] GET error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = regulatoryRequestSchema.safeParse(body);
  if (!parsed.success) {
    const errors = parsed.error.issues.map((i) => {
      const path = i.path.join('.');
      return path ? `${path}: ${i.message}` : i.message;
    });
    return NextResponse.json({ error: 'Validation failed', details: errors }, { status: 400 });
  }

  try {
    const data = parsed.data;
    const regimes: ComplianceRegime[] = data.regimes ?? ['SEC', 'EPA', 'CARBON_TAX'];

    const input: RegulatoryFilingInput = {
      buyerId: data.buyerId,
      companyName: data.companyName,
      reportingPeriodStart: data.reportingPeriodStart,
      reportingPeriodEnd: data.reportingPeriodEnd,
      reportingYear: data.reportingYear,
      emissionsTonnes: data.emissionsTonnes,
      offsetsTonnes: data.offsetsTonnes,
      offsetSources: data.offsetSources,
      carbonTaxRate: data.carbonTaxRate,
      jurisdiction: data.jurisdiction,
      state: data.state,
      facilityId: data.facilityId,
      offsetPositions: data.offsetPositions as OffsetPosition[] | undefined,
    };

    const bundle = generateRegulatoryBundle(input, regimes);
    return NextResponse.json({ bundle }, { status: 201 });
  } catch (error) {
    console.error('[v1/compliance/regulatory] POST error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
