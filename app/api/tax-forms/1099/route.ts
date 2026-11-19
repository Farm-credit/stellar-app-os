/**
 * Farmer tax documentation (v2)
 *
 * GET  /api/tax-forms/1099
 *   ?year=2024                       — required, the tax (calendar) year
 *   &type=1099-NEC|income-summary|carbon-credit-sales|all   (default: all)
 *   &format=json|csv                 (default: json; csv requires a single type)
 *   &planterId=42                    — admin only, generate for another planter
 *
 * POST /api/tax-forms/1099
 *   body: { year, type?, planterId? }  — generates and persists the documents
 *   into `tax_documents` (idempotent per planter/year/form).
 *
 * Responses:
 *   200  application/json|csv — generated tax documents
 *   201  application/json     — documents persisted by POST
 *   400  application/json     — missing/invalid year, type or format
 *   401  application/json     — missing/invalid bearer token
 *   403  application/json     — planter requesting another planter's data
 *   404  application/json     — planter not found or soft-deleted
 *   500  application/json     — unexpected server error
 *
 * Authentication:
 *   Planter JWT (Authorization: Bearer <token>) whose subject is the planter's
 *   Stellar address, matching the convention used by
 *   /api/planters/[planterId]/payouts/export.  Admin tokens may target any
 *   planter via `planterId`.
 *
 * Privacy:
 *   Documents expose planter income, so responses are always
 *   `Cache-Control: no-store` and the recipient TIN is never returned — only
 *   whether one is on file.
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { verifyPlanterJwt } from '@/lib/auth/jwt';
import {
  findActivePlanterByAddress,
  findActivePlanterById,
  saveTaxDocument,
  type PlanterIdentityRow,
} from '@/lib/db/tax-documents';
import { generateTaxDocuments, taxDocumentToCsv } from '@/lib/services/tax-documentation';
import { TAX_FORM_TYPES, type TaxFormType } from '@/lib/tax/tax-reporting';

export const runtime = 'nodejs';

type RequestedType = TaxFormType | 'all';

interface ParsedRequest {
  planterId: number | null;
  taxYear: number;
  type: RequestedType;
  format: 'json' | 'csv';
}

// ── Handlers ──────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await authenticate(request);
  if ('error' in auth) return auth.error;

  const parsed = parseRequest(request.nextUrl.searchParams, false);
  if ('error' in parsed) return parsed.error;

  if (parsed.format === 'csv' && parsed.type === 'all') {
    return jsonError('format=csv requires a single type (1099-NEC, income-summary, carbon-credit-sales)', 400);
  }

  const planter = await resolvePlanter(auth.payload.sub, parsed.planterId, auth.isAdmin);
  if ('error' in planter) return planter.error;

  try {
    const documents = await generateTaxDocuments({
      planter: planter.planter,
      taxYear: parsed.taxYear,
    });

    if (parsed.format === 'csv') {
      const csv = taxDocumentToCsv(documents, parsed.type as TaxFormType);
      const filename = `tax-${parsed.type}-planter-${planter.planter.id}-${parsed.taxYear}.csv`;
      const recordCount =
        documents.documents.find((entry) => entry.formType === parsed.type)?.recordCount ?? 0;

      return new NextResponse(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Cache-Control': 'no-store, max-age=0',
          'X-Record-Count': String(recordCount),
        },
      });
    }

    return NextResponse.json(
      {
        taxYear: parsed.taxYear,
        planterId: planter.planter.id,
        requestedType: parsed.type,
        documents: toDocumentMap(documents, parsed.type),
      },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  } catch (err) {
    console.error('[api/tax-forms/1099][GET] generation failed', {
      planterId: planter.planter.id,
      taxYear: parsed.taxYear,
      err,
    });
    return jsonError('Internal server error', 500);
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await authenticate(request);
  if ('error' in auth) return auth.error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError('Request body must be valid JSON', 400);
  }

  const payload = (body ?? {}) as Record<string, unknown>;
  const searchParams = new URLSearchParams();
  if (payload.year !== undefined) searchParams.set('year', String(payload.year));
  if (payload.type !== undefined) searchParams.set('type', String(payload.type));
  if (payload.planterId !== undefined) searchParams.set('planterId', String(payload.planterId));

  const parsed = parseRequest(searchParams, false);
  if ('error' in parsed) return parsed.error;

  const planter = await resolvePlanter(auth.payload.sub, parsed.planterId, auth.isAdmin);
  if ('error' in planter) return planter.error;

  try {
    const documents = await generateTaxDocuments({
      planter: planter.planter,
      taxYear: parsed.taxYear,
    });

    const requested = documents.documents.filter(
      (entry) => parsed.type === 'all' || entry.formType === parsed.type
    );

    const saved = [];
    for (const entry of requested) {
      saved.push(
        await saveTaxDocument({
          planterId: planter.planter.id,
          taxYear: parsed.taxYear,
          formType: entry.formType,
          status: 'generated',
          grossAmount: entry.grossAmount,
          recordCount: entry.recordCount,
          payload: entry.document,
          generatedBy: auth.payload.sub,
        })
      );
    }

    return NextResponse.json(
      {
        taxYear: parsed.taxYear,
        planterId: planter.planter.id,
        saved: saved.map((row) => ({
          id: row.id,
          formType: row.form_type,
          status: row.status,
          grossAmount: Number(row.gross_amount),
          recordCount: row.record_count,
          generatedAt: row.generated_at,
        })),
        documents: toDocumentMap(documents, parsed.type),
      },
      { status: 201, headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  } catch (err) {
    console.error('[api/tax-forms/1099][POST] generation failed', {
      planterId: planter.planter.id,
      taxYear: parsed.taxYear,
      err,
    });
    return jsonError('Internal server error', 500);
  }
}

// ── Auth & parameter parsing ──────────────────────────────────────────────────

type AuthResult =
  | { payload: { sub: string; role?: string }; isAdmin: boolean }
  | { error: NextResponse };

async function authenticate(request: NextRequest): Promise<AuthResult> {
  const authHeader = request.headers.get('authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) {
    return { error: jsonError('Authorization header with Bearer token is required', 401) };
  }

  const payload = await verifyPlanterJwt(token);
  if (!payload || !payload.sub) {
    return { error: jsonError('Invalid or expired token', 401) };
  }

  return {
    payload: { sub: payload.sub, role: (payload as { role?: string }).role },
    isAdmin: (payload as { role?: string }).role === 'admin',
  };
}

type ParseResult = ParsedRequest | { error: NextResponse };

function parseRequest(searchParams: URLSearchParams, allowDefaultYear: boolean): ParseResult {
  const yearParam = searchParams.get('year');
  if (!yearParam && !allowDefaultYear) {
    return { error: jsonError('Missing required query parameter: year', 400) };
  }

  const taxYear = parseYear(yearParam ?? String(new Date().getUTCFullYear()));
  if (taxYear === null) {
    return { error: jsonError('year must be a valid 4-digit calendar year (e.g. 2024)', 400) };
  }

  const typeParam = searchParams.get('type') ?? 'all';
  if (typeParam !== 'all' && !TAX_FORM_TYPES.includes(typeParam as TaxFormType)) {
    return {
      error: jsonError(`type must be one of: all, ${TAX_FORM_TYPES.join(', ')}`, 400),
    };
  }

  const formatParam = searchParams.get('format') ?? 'json';
  if (formatParam !== 'json' && formatParam !== 'csv') {
    return { error: jsonError('format must be json or csv', 400) };
  }

  const planterIdParam = searchParams.get('planterId');
  let planterId: number | null = null;
  if (planterIdParam !== null) {
    planterId = parsePositiveInt(planterIdParam);
    if (planterId === null) {
      return { error: jsonError('planterId must be a positive integer', 400) };
    }
  }

  return { planterId, taxYear, type: typeParam as RequestedType, format: formatParam };
}

type PlanterResult = { planter: PlanterIdentityRow } | { error: NextResponse };

/**
 * Resolves the target planter.  A planter may only read their own documents;
 * admin tokens may pass `planterId` to generate for someone else.
 */
async function resolvePlanter(
  stellarAddress: string,
  planterId: number | null,
  isAdmin: boolean
): Promise<PlanterResult> {
  if (planterId !== null && !isAdmin) {
    return { error: jsonError('Forbidden: planterId requires an admin token', 403) };
  }

  try {
    const planter =
      planterId !== null
        ? await findActivePlanterById(planterId)
        : await findActivePlanterByAddress(stellarAddress);

    if (!planter) return { error: jsonError('Planter not found', 404) };
    return { planter };
  } catch (err) {
    console.error('[api/tax-forms/1099] DB error resolving planter', { stellarAddress, planterId, err });
    return { error: jsonError('Internal server error', 500) };
  }
}

// ── Response helpers ──────────────────────────────────────────────────────────

function toDocumentMap(
  documents: Awaited<ReturnType<typeof generateTaxDocuments>>,
  type: RequestedType
): Record<string, unknown> {
  const entries: [TaxFormType, unknown][] = [
    ['1099-NEC', documents.form1099Nec],
    ['income-summary', documents.incomeSummary],
    ['carbon-credit-sales', documents.carbonCreditSales],
  ];

  return Object.fromEntries(
    entries.filter(([formType]) => type === 'all' || formType === type)
  );
}

function jsonError(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

/**
 * Parses a string to a positive integer, or returns null on failure.
 * Guards against prototype-pollution via numeric-string injection.
 */
function parsePositiveInt(value: string): number | null {
  if (!/^\d+$/.test(value)) return null;
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Parses a 4-digit year (1900–2100), or null when implausible. */
function parseYear(value: string): number | null {
  if (!/^\d{4}$/.test(value)) return null;
  const n = parseInt(value, 10);
  return n >= 1900 && n <= 2100 ? n : null;
}
