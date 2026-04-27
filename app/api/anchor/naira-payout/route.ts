/**
 * POST /api/anchor/naira-payout
 *
 * Initiates a USDC → NGN farmer payout through the configured Stellar anchor.
 * Supports two modes:
 *   - SEP-31 direct payment (programmatic, for backend-initiated payouts)
 *   - SEP-24 interactive withdrawal (returns a URL the farmer opens)
 *
 * The caller is responsible for submitting the actual Stellar payment transaction
 * to the address returned by SEP-31, or directing the farmer to the SEP-24 URL.
 */

import { NextResponse } from 'next/server';
import {
  fetchStellarToml,
  getNairaQuote,
  initiateSep24Withdrawal,
  initiateSep31Payout,
} from '@/lib/stellar/anchor-payout';
import type { Sep31PayoutRequest } from '@/lib/stellar/anchor-payout';

interface NairaPayoutRequestBody {
  /** Farmer's Stellar public key */
  farmerPublicKey: string;
  /** USDC amount (human-readable, e.g. 10.5) */
  usdcAmount: number;
  offRampMethod: 'mobile_money' | 'bank_transfer';
  /** SEP-10 JWT obtained from the client wallet */
  sep10Jwt: string;
  /** 'sep24' for interactive UI, 'sep31' for programmatic (default) */
  mode?: 'sep24' | 'sep31';
  /** Required for mobile_money */
  mobileNumber?: string;
  /** Required for bank_transfer */
  bankAccountNumber?: string;
  bankCode?: string;
  /** Optional pre-obtained SEP-38 quote ID */
  quoteId?: string;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as NairaPayoutRequestBody;

    const {
      farmerPublicKey,
      usdcAmount,
      offRampMethod,
      sep10Jwt,
      mode = 'sep31',
      mobileNumber,
      bankAccountNumber,
      bankCode,
      quoteId,
    } = body;

    // ── Validate required fields ──────────────────────────────────────────────
    if (!farmerPublicKey || !usdcAmount || !offRampMethod || !sep10Jwt) {
      return NextResponse.json(
        { error: 'Missing required fields: farmerPublicKey, usdcAmount, offRampMethod, sep10Jwt' },
        { status: 400 }
      );
    }

    if (usdcAmount <= 0) {
      return NextResponse.json({ error: 'usdcAmount must be positive' }, { status: 400 });
    }

    if (offRampMethod === 'mobile_money' && !mobileNumber) {
      return NextResponse.json(
        { error: 'mobileNumber is required for mobile_money off-ramp' },
        { status: 400 }
      );
    }

    if (offRampMethod === 'bank_transfer' && (!bankAccountNumber || !bankCode)) {
      return NextResponse.json(
        { error: 'bankAccountNumber and bankCode are required for bank_transfer off-ramp' },
        { status: 400 }
      );
    }

    // ── Discover anchor endpoints from stellar.toml ───────────────────────────
    const anchorHomeDomain = process.env.NEXT_PUBLIC_ANCHOR_HOME_DOMAIN ?? 'testanchor.stellar.org';
    const usdcIssuer = process.env.NEXT_PUBLIC_USDC_ISSUER ?? '';
    const usdcAssetCode = 'USDC';

    const toml = await fetchStellarToml(anchorHomeDomain);

    // ── Fetch NGN quote if not supplied ───────────────────────────────────────
    let resolvedQuoteId = quoteId;
    let ngnQuote = null;

    if (toml.ANCHOR_QUOTE_SERVER && !resolvedQuoteId) {
      try {
        ngnQuote = await getNairaQuote(toml.ANCHOR_QUOTE_SERVER, usdcAmount, usdcIssuer, sep10Jwt);
        resolvedQuoteId = ngnQuote.quoteId || undefined;
      } catch {
        // Quote server optional — continue without it
      }
    }

    // ── Execute the chosen payout mode ────────────────────────────────────────
    if (mode === 'sep24') {
      if (!toml.TRANSFER_SERVER_SEP0024) {
        return NextResponse.json(
          { error: 'Anchor does not support SEP-24 (TRANSFER_SERVER_SEP0024 missing)' },
          { status: 502 }
        );
      }

      const result = await initiateSep24Withdrawal(
        toml.TRANSFER_SERVER_SEP0024,
        farmerPublicKey,
        usdcAmount,
        usdcAssetCode,
        sep10Jwt,
        resolvedQuoteId
      );

      return NextResponse.json({
        mode: 'sep24',
        ...result,
        quote: ngnQuote,
      });
    }

    // Default: SEP-31 direct payment
    if (!toml.DIRECT_PAYMENT_SERVER) {
      return NextResponse.json(
        { error: 'Anchor does not support SEP-31 (DIRECT_PAYMENT_SERVER missing)' },
        { status: 502 }
      );
    }

    const sep31Request: Sep31PayoutRequest = {
      farmerPublicKey,
      usdcAmount,
      offRampMethod,
      mobileNumber,
      bankAccountNumber,
      bankCode,
      sep10Jwt,
      quoteId: resolvedQuoteId,
    };

    const result = await initiateSep31Payout(
      toml.DIRECT_PAYMENT_SERVER,
      sep31Request,
      usdcAssetCode,
      usdcIssuer,
      sep10Jwt
    );

    return NextResponse.json({
      mode: 'sep31',
      ...result,
      quote: ngnQuote,
    });
  } catch (error) {
    console.error('[naira-payout] error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
