/**
 * POST /api/nft/limited-edition/mint
 *
 * Mints a limited-edition NFT for a rare or endangered tree species (#1162).
 *
 * Extends the standard /api/nft/mint flow with:
 *   - Species catalogue validation (must be a registered rare species)
 *   - Atomic supply-cap enforcement via Redis INCR
 *   - Edition-number assignment and rich on-chain metadata
 *   - Rarity tier, IUCN status, and conservation lore encoded in attributes
 *
 * Returns the same Soroban XDR pattern as /api/nft/mint so the frontend
 * can use the same signing flow.
 */

import { NextResponse } from 'next/server';
import path from 'path';
import { mintLimitedEditionNft, SupplyExhaustedError, UnknownRareSpeciesError } from '@/lib/nft/limited-edition-mint';
import type { MintLimitedEditionRequest } from '@/lib/types/limited-edition-nft';
import logger from '@/lib/logger';

export const runtime = 'nodejs';

export async function POST(req: Request): Promise<Response> {
  let body: MintLimitedEditionRequest;
  try {
    body = (await req.json()) as MintLimitedEditionRequest;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // ── Validation ──────────────────────────────────────────────────────────────
  const requiredFields = [
    'speciesSlug',
    'recipientAddress',
    'txHash',
    'donationId',
    'plantingDate',
    'region',
    'network',
  ] as const;

  const missingFields = requiredFields.filter(
    (f) => !body[f] || (typeof body[f] === 'string' && !(body[f] as string).trim())
  );
  if (missingFields.length > 0) {
    return NextResponse.json(
      { error: `Missing required fields: ${missingFields.join(', ')}` },
      { status: 400 }
    );
  }

  if (body.network !== 'testnet' && body.network !== 'mainnet') {
    return NextResponse.json({ error: 'UNSUPPORTED_NETWORK' }, { status: 400 });
  }

  if (!/^G[A-Z2-7]{55}$/.test(body.recipientAddress)) {
    return NextResponse.json({ error: 'INVALID_RECIPIENT_ADDRESS' }, { status: 400 });
  }

  if (isNaN(new Date(body.plantingDate).getTime())) {
    return NextResponse.json({ error: 'plantingDate must be a valid ISO-8601 date' }, { status: 400 });
  }

  // ── Mint ────────────────────────────────────────────────────────────────────
  try {
    const url = new URL(req.url);
    const metadataBaseUrl = url.origin;
    const metadataDir = path.join(process.cwd(), 'public', 'metadata');

    const result = await mintLimitedEditionNft(body, metadataBaseUrl, metadataDir);

    logger.info('[api:nft:limited-edition:mint] Minted limited edition NFT', {
      speciesSlug: body.speciesSlug,
      editionNumber: result.editionNumber,
      maxSupply: result.maxSupply,
      rarity: result.rarity,
      recipientAddress: body.recipientAddress,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    if (err instanceof SupplyExhaustedError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    if (err instanceof UnknownRareSpeciesError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }

    const msg = err instanceof Error ? err.message : 'Internal Server Error';
    logger.error('[api:nft:limited-edition:mint] Error', { err });

    if (msg === 'CONTRACT_NOT_CONFIGURED') {
      return NextResponse.json({ error: msg }, { status: 503 });
    }
    if (msg.includes('acquire lock')) {
      return NextResponse.json({ error: msg }, { status: 409 });
    }

    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
