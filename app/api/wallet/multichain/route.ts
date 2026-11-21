/**
 * /api/wallet/multichain — Issue #1310
 *
 * Fee-aware routing for a farmer's credits across Stellar, Polygon and Ethereum.
 *
 * GET  /api/wallet/multichain
 *   → 200 { chains, bridgeFees, example } — supported networks and cost model.
 *
 * POST /api/wallet/multichain
 *   Body: { quantityTonnes, quotes, balances?, destinationChain?, excludeChains?,
 *           mode?: 'route' | 'compare' }
 *   - `route`   (default) → ranked purchase/bridge routes (`planCreditTransfer`)
 *   - `compare` → cheapest chain to buy on (`compareChainPrices`)
 *
 *   → 200 { mode, result }
 *   → 400 { error, details: string[] }
 */

import { NextResponse } from 'next/server';
import {
  CHAIN_REGISTRY,
  SUPPORTED_CHAINS,
  compareChainPrices,
  listChains,
  planCreditTransfer,
} from '@/lib/wallet/multichain';
import type { CreditQuote, CreditTransferRequest } from '@/lib/types/multichain-wallet';

export const runtime = 'nodejs';

type RequestBody = CreditTransferRequest & { mode?: 'route' | 'compare' };

const EXAMPLE: RequestBody = {
  mode: 'route',
  quantityTonnes: 25,
  destinationChain: 'stellar',
  quotes: [
    { chain: 'stellar', pricePerTonne: 42.5, availableTonnes: 500 },
    { chain: 'polygon', pricePerTonne: 41.2, availableTonnes: 320 },
    { chain: 'ethereum', pricePerTonne: 44.8, availableTonnes: 120 },
  ],
  balances: { polygon: 40 },
};

export function GET(): NextResponse {
  return NextResponse.json({
    chains: listChains(),
    bridgeFees: SUPPORTED_CHAINS.map((chain) => ({
      chain,
      bridgeFeeBps: CHAIN_REGISTRY[chain].bridgeFeeBps,
      gasCostUsd: CHAIN_REGISTRY[chain].gasCostUsd,
    })),
    example: EXAMPLE,
  });
}

export async function POST(request: Request): Promise<NextResponse> {
  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 });
  }

  const mode = body?.mode ?? 'route';
  const accepted = SUPPORTED_CHAINS as string[];
  const unknownChains = (body?.quotes ?? [])
    .map((quote: CreditQuote) => quote?.chain)
    .filter((chain) => chain && !accepted.includes(chain));
  if (unknownChains.length > 0) {
    return NextResponse.json(
      { error: 'Unsupported chain in quotes', details: unknownChains },
      { status: 400 }
    );
  }

  try {
    if (mode === 'compare') {
      return NextResponse.json({
        mode,
        result: compareChainPrices(body.quotes ?? [], {
          quantityTonnes: body.quantityTonnes,
        }),
      });
    }

    if (mode !== 'route') {
      return NextResponse.json(
        { error: 'mode must be either "route" or "compare"' },
        { status: 400 }
      );
    }

    return NextResponse.json({ mode, result: planCreditTransfer(body) });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Unable to plan multi-chain transfer',
        details: [error instanceof Error ? error.message : 'Unknown error'],
      },
      { status: 400 }
    );
  }
}
