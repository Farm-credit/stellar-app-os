import { type NextRequest, NextResponse } from 'next/server';
import {
  createTaxExemptReceipt,
  listTaxExemptReceipts,
  storeTaxExemptReceipt,
  validateReceiptCreationInput,
  type CreateReceiptInput,
} from '@/lib/sponsor-receipts';

/**
 * GET /api/sponsor/receipts
 * Lists tax-exempt impact receipts filtered by benefactor, tax year, or keyword search.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const walletAddress = searchParams.get('walletAddress') ?? undefined;
    const taxYearParam = searchParams.get('taxYear');
    const taxYear = taxYearParam ? parseInt(taxYearParam, 10) : undefined;
    const search = searchParams.get('search') ?? undefined;

    const receipts = listTaxExemptReceipts({
      walletAddress,
      taxYear: isNaN(taxYear as number) ? undefined : taxYear,
      search,
    });

    const totalEndowmentsUsd = receipts.reduce(
      (acc, r) => acc + r.endowment.fiatValueUsd,
      0
    );
    const totalCo2Tonnes = Number(
      receipts.reduce((acc, r) => acc + r.impact.co2OffsetTonnes, 0).toFixed(2)
    );
    const totalStewardsFunded = receipts.reduce(
      (acc, r) => acc + r.stewards.totalRecipients,
      0
    );

    return NextResponse.json({
      receipts,
      totalCount: receipts.length,
      summary: {
        totalEndowmentsUsd,
        totalCo2Tonnes,
        totalStewardsFunded,
      },
    });
  } catch (error) {
    console.warn('[sponsor-receipts-api] Failed to retrieve receipts:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve sponsor tax-exempt receipts.' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/sponsor/receipts
 * Generates an audited tax-exempt receipt for a corporate environmental endowment.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as Partial<CreateReceiptInput> | null;

    if (!body) {
      console.warn('[sponsor-receipts-api] Empty or invalid JSON payload');
      return NextResponse.json({ error: 'Invalid JSON request body.' }, { status: 400 });
    }

    const validation = validateReceiptCreationInput(body);
    if (!validation.isValid) {
      console.warn('[sponsor-receipts-api] Validation failed:', validation.errors);
      return NextResponse.json(
        {
          error: 'Validation failed for tax-exempt receipt generation.',
          details: validation.errors,
        },
        { status: 400 }
      );
    }

    const receipt = createTaxExemptReceipt(body as CreateReceiptInput);
    storeTaxExemptReceipt(receipt);

    return NextResponse.json(
      {
        message: 'Tax-exempt impact receipt successfully generated and cryptographically sealed.',
        receipt,
      },
      { status: 201 }
    );
  } catch (error) {
    console.warn('[sponsor-receipts-api] Error generating receipt:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal receipt generation error' },
      { status: 500 }
    );
  }
}
