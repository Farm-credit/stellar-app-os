import { timingSafeEqual } from 'node:crypto';
import { StrKey } from '@stellar/stellar-sdk';
import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db/client';
import {
  FieldCreditAlreadyReservedError,
  FieldCreditNotEligibleError,
  issueFieldCreditForTree,
  listEligibleFieldCredits,
} from '@/lib/carbon/verified-field-credits';
import type { NetworkType } from '@/lib/types/wallet';

export const runtime = 'nodejs';

function issuerTokenIsConfigured(): boolean {
  return (process.env.FIELD_CREDIT_ISSUER_TOKEN?.length ?? 0) >= 32;
}

function isAuthorized(request: Request): boolean {
  const expected = process.env.FIELD_CREDIT_ISSUER_TOKEN;
  const authorization = request.headers.get('authorization');
  if (!expected || expected.length < 32 || !authorization?.startsWith('Bearer ')) return false;

  const supplied = Buffer.from(authorization.slice('Bearer '.length));
  const trusted = Buffer.from(expected);
  return supplied.length === trusted.length && timingSafeEqual(supplied, trusted);
}

function validStellarPublicKey(value: unknown): value is string {
  return typeof value === 'string' && StrKey.isValidEd25519PublicKey(value);
}

function unauthorizedOrUnconfigured(request: Request): NextResponse | null {
  if (!issuerTokenIsConfigured()) {
    return NextResponse.json(
      { error: 'Field-credit issuance is not configured on this deployment.' },
      { status: 503 }
    );
  }
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}

export async function GET(request: Request) {
  const authError = unauthorizedOrUnconfigured(request);
  if (authError) return authError;

  const sponsorWallet = new URL(request.url).searchParams.get('sponsorWallet');
  if (!validStellarPublicKey(sponsorWallet)) {
    return NextResponse.json({ error: 'A valid sponsorWallet is required.' }, { status: 400 });
  }

  try {
    const eligibleCredits = await listEligibleFieldCredits(getPool(), sponsorWallet);
    return NextResponse.json({ eligibleCredits });
  } catch (error) {
    console.error('[api:field-credits] Eligibility preview failed', error);
    return NextResponse.json(
      {
        error:
          'Unable to load verified field-credit eligibility. Confirm migration 030 is applied.',
      },
      { status: 503 }
    );
  }
}

export async function POST(request: Request) {
  const authError = unauthorizedOrUnconfigured(request);
  if (authError) return authError;

  let body: { sponsorWallet?: unknown; treeId?: unknown; network?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 });
  }

  const sponsorWallet = body.sponsorWallet;
  const treeId = body.treeId;
  const network = body.network ?? process.env.NEXT_PUBLIC_STELLAR_NETWORK ?? 'testnet';
  const contractId = process.env.NEXT_PUBLIC_CONTRACT_CARBON_CREDITS;
  if (!validStellarPublicKey(sponsorWallet)) {
    return NextResponse.json({ error: 'A valid sponsorWallet is required.' }, { status: 400 });
  }
  if (!Number.isSafeInteger(treeId) || (treeId as number) <= 0) {
    return NextResponse.json({ error: 'treeId must be a positive integer.' }, { status: 400 });
  }
  if (network !== 'testnet' && network !== 'mainnet') {
    return NextResponse.json({ error: 'network must be testnet or mainnet.' }, { status: 400 });
  }
  if (!contractId) {
    return NextResponse.json(
      { error: 'Carbon-credit contract is not configured on this deployment.' },
      { status: 503 }
    );
  }

  try {
    const result = await issueFieldCreditForTree(getPool(), {
      sponsorWallet,
      treeId: treeId as number,
      network: network as NetworkType,
      contractId,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof FieldCreditAlreadyReservedError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof FieldCreditNotEligibleError) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    // Do not retry automatically: a Soroban timeout can mean the transaction
    // reached the network but confirmation was not observed before the deadline.
    console.error('[api:field-credits] Issuance failed or needs reconciliation', error);
    return NextResponse.json(
      {
        error:
          'Issuance could not be confirmed. The reservation is retained for reconciliation; do not retry.',
      },
      { status: 503 }
    );
  }
}
