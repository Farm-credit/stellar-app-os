/**
 * POST /api/v2/csr-report/verify
 *
 * Verifies the Ed25519 signature on a platform-signed CSR report
 * (GRI Standards or TCFD) and returns a structured verification result.
 *
 * Issue #1670 — Corporate CSR Reporting Module
 *
 * Request body: SignedCsrReport JSON (as downloaded from the GRI/TCFD export)
 *
 * Response 200 — signature valid:
 *   { valid: true, standard, reportId, companyName, generatedAt, publicKey }
 *
 * Response 200 — signature invalid:
 *   { valid: false, ..., error: string }
 *
 * Response 400 — malformed request body:
 *   { error: string }
 *
 * The endpoint intentionally returns HTTP 200 for both valid and invalid
 * signatures so callers can distinguish "the check ran" from "bad request".
 * Callers must inspect the `valid` boolean in the response body.
 */

import { type NextRequest, NextResponse } from 'next/server';
import { verifyCsrReport, type SignedCsrReport } from '@/lib/csr-reporting';

// ── Request validation helpers ────────────────────────────────────────────────

function isString(v: unknown): v is string {
  return typeof v === 'string';
}

function isSignedCsrReport(body: unknown): body is SignedCsrReport {
  if (typeof body !== 'object' || body === null) return false;
  const b = body as Record<string, unknown>;

  // Top-level fields
  if (!isString(b.standard) || !isString(b.generatedAt)) return false;
  if (typeof b.report !== 'object' || b.report === null) return false;
  if (typeof b.integrity !== 'object' || b.integrity === null) return false;

  // integrity envelope
  const integrity = b.integrity as Record<string, unknown>;
  if (
    !isString(integrity.algorithm) ||
    !isString(integrity.keyId) ||
    !isString(integrity.signature) ||
    !isString(integrity.publicKey)
  ) {
    return false;
  }

  // report body
  const report = b.report as Record<string, unknown>;
  if (!isString(report.reportId) || !isString(report.companyName)) return false;

  return true;
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Request body must be valid JSON.' },
      { status: 400 }
    );
  }

  if (!isSignedCsrReport(body)) {
    return NextResponse.json(
      {
        error:
          'Invalid request body. Expected a SignedCsrReport object with standard, generatedAt, report, and integrity fields.',
      },
      { status: 400 }
    );
  }

  const result = verifyCsrReport(body);

  return NextResponse.json(result, {
    status: 200,
    headers: {
      'Cache-Control': 'no-store',
    },
  });
}

// Reject methods other than POST with a clear error
export async function GET() {
  return NextResponse.json(
    {
      error:
        'Use POST with a SignedCsrReport JSON body to verify a CSR report signature.',
      usage: {
        method: 'POST',
        contentType: 'application/json',
        body: 'SignedCsrReport (as downloaded from the GRI or TCFD export)',
      },
    },
    { status: 405, headers: { Allow: 'POST' } }
  );
}
