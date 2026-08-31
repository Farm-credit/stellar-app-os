/**
 * POST /api/invoice/generate
 *
 * Generates a branded PDF invoice for B2B corporate sponsors (#1138).
 *
 * When `returnBase64` is false (default), responds with the PDF binary
 * (Content-Type: application/pdf) so the browser triggers a download.
 * When `returnBase64` is true, responds with JSON containing the
 * base64-encoded PDF data URI.
 */

import { type NextRequest, NextResponse } from 'next/server';
import { generateSponsorInvoicePdf } from '@/lib/invoice/invoice-generator';
import type { InvoiceGenerateRequest } from '@/lib/types/invoice';

export const runtime = 'nodejs';

// ── Validation helpers ───────────────────────────────────────────────────────

const VALID_CURRENCIES = ['USD', 'EUR', 'GBP'] as const;
const VALID_TERMS = ['net-7', 'net-14', 'net-30', 'net-60', 'due-on-receipt'] as const;

function isIso8601(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const d = new Date(value);
  return !isNaN(d.getTime());
}

function validateRequest(body: unknown): { valid: true; data: InvoiceGenerateRequest } | { valid: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Request body must be a JSON object' };
  }

  const b = body as Record<string, unknown>;

  if (typeof b.invoiceNumber !== 'string' || !b.invoiceNumber.trim()) {
    return { valid: false, error: 'invoiceNumber is required and must be a non-empty string' };
  }

  if (!isIso8601(b.issueDate)) {
    return { valid: false, error: 'issueDate must be a valid ISO-8601 date string' };
  }

  if (!VALID_TERMS.includes(b.paymentTerms as typeof VALID_TERMS[number])) {
    return {
      valid: false,
      error: `paymentTerms must be one of: ${VALID_TERMS.join(', ')}`,
    };
  }

  if (!VALID_CURRENCIES.includes(b.currency as typeof VALID_CURRENCIES[number])) {
    return {
      valid: false,
      error: `currency must be one of: ${VALID_CURRENCIES.join(', ')}`,
    };
  }

  const sponsor = b.sponsor as Record<string, unknown>;
  if (!sponsor || typeof sponsor !== 'object') {
    return { valid: false, error: 'sponsor object is required' };
  }
  if (typeof sponsor.companyName !== 'string' || !sponsor.companyName.trim()) {
    return { valid: false, error: 'sponsor.companyName is required' };
  }
  if (typeof sponsor.email !== 'string' || !sponsor.email.includes('@')) {
    return { valid: false, error: 'sponsor.email must be a valid email address' };
  }

  if (!Array.isArray(b.lineItems) || b.lineItems.length === 0) {
    return { valid: false, error: 'lineItems must be a non-empty array' };
  }

  for (let i = 0; i < b.lineItems.length; i++) {
    const item = b.lineItems[i] as Record<string, unknown>;
    if (typeof item.description !== 'string' || !item.description.trim()) {
      return { valid: false, error: `lineItems[${i}].description is required` };
    }
    if (typeof item.quantity !== 'number' || item.quantity <= 0) {
      return { valid: false, error: `lineItems[${i}].quantity must be a positive number` };
    }
    if (typeof item.unitPrice !== 'number' || item.unitPrice < 0) {
      return { valid: false, error: `lineItems[${i}].unitPrice must be a non-negative number` };
    }
    if (typeof item.subtotal !== 'number' || item.subtotal < 0) {
      return { valid: false, error: `lineItems[${i}].subtotal must be a non-negative number` };
    }
  }

  return { valid: true, data: b as unknown as InvoiceGenerateRequest };
}

// ── Route handler ────────────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const validation = validateRequest(body);
  if (!validation.valid) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const req = validation.data;

  try {
    const result = generateSponsorInvoicePdf(req);

    if (req.returnBase64) {
      return NextResponse.json({
        invoiceNumber: result.invoiceNumber,
        subtotal: result.subtotal,
        taxTotal: result.taxTotal,
        grandTotal: result.grandTotal,
        currency: result.currency,
        issuedAt: result.issuedAt,
        dueDate: result.dueDate,
        base64Pdf: result.base64Pdf,
      });
    }

    // Return binary PDF for direct browser download
    const filename = `invoice-${req.invoiceNumber.replace(/[^a-zA-Z0-9-]/g, '-')}.pdf`;
    return new NextResponse(result.pdfBytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
        'X-Invoice-Number': req.invoiceNumber,
        'X-Grand-Total': String(result.grandTotal),
        'X-Currency': result.currency,
      },
    });
  } catch (err) {
    console.error('[api/invoice/generate] Error generating invoice PDF:', err);
    const message = err instanceof Error ? err.message : 'Failed to generate invoice';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
