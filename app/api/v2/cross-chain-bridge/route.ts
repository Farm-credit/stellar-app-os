/**
 * API v2 — Cross-chain XLM bridge (Issue #1093)
 *
 * GET  /api/v2/cross-chain-bridge?lockId=1        → single lock
 * GET  /api/v2/cross-chain-bridge?sender=GABC…    → locks for sender
 * GET  /api/v2/cross-chain-bridge?amount=10000000 → fee quote
 * GET  /api/v2/cross-chain-bridge                 → bridge config
 *
 * POST /api/v2/cross-chain-bridge                 → operator actions
 *   { action: 'execute', lockId }                 → execute purchase
 *   { action: 'cancel', lockId }                  → cancel + refund
 *   { action: 'pause' | 'unpause' }               → pause switch
 *   { action: 'set-fee', feeBps }                 → fee in bps (≤500)
 *   { action: 'set-escrow', escrow }              → tree-escrow address
 *
 * The user-side `lock_for_purchase` is signed in-browser (Freighter/Albedo)
 * via `lockForPurchase()` from '@/lib/stellar/xlm-bridge'.
 */

import { NextResponse } from 'next/server';
import {
  cancelLock,
  executePurchase,
  getBridgeConfig,
  getBridgeLock,
  getLocksForSender,
  quoteBridgeFee,
  setBridgeFeeBps,
  setBridgePaused,
  setBridgeTreeEscrow,
} from '@/lib/stellar/xlm-bridge';
import type { NetworkType } from '@/lib/types/wallet';

export const dynamic = 'force-dynamic';

const API_VERSION = 'v2';

function json(body: unknown, status = 200): NextResponse {
  const res = NextResponse.json(body, { status });
  res.headers.set('X-API-Version', API_VERSION);
  res.headers.set('Cache-Control', 'no-store');
  return res;
}

function badRequest(message: string): NextResponse {
  return json({ error: message }, 400);
}

function getNetwork(url: URL): NetworkType {
  return url.searchParams.get('network') === 'mainnet' ? 'mainnet' : 'testnet';
}

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const network = getNetwork(url);

  try {
    const lockId = url.searchParams.get('lockId');
    if (lockId !== null) {
      const id = Number(lockId);
      if (!Number.isInteger(id) || id <= 0) return badRequest('lockId must be a positive integer');
      const lock = await getBridgeLock(id, network);
      if (!lock) return json({ error: 'lock not found' }, 404);
      return json({ lock });
    }

    const sender = url.searchParams.get('sender');
    if (sender !== null) {
      if (!sender.startsWith('G') || sender.length !== 56) {
        return badRequest('sender must be a 56-character Stellar address');
      }
      const lockIds = await getLocksForSender(sender, network);
      return json({ sender, lockIds });
    }

    const amount = url.searchParams.get('amount');
    if (amount !== null) {
      if (!/^\d+$/.test(amount)) return badRequest('amount must be a positive integer (stroops)');
      const fee = await quoteBridgeFee(amount, network);
      return json({ amount, fee });
    }

    const config = await getBridgeConfig(network);
    return json({ config });
  } catch (err) {
    return json(
      { error: 'bridge query failed', detail: err instanceof Error ? err.message : String(err) },
      502,
    );
  }
}

type PostBody = {
  action?: string;
  network?: string;
  lockId?: number;
  feeBps?: number;
  escrow?: string;
};

export async function POST(request: Request): Promise<NextResponse> {
  let body: PostBody;
  try {
    body = (await request.json()) as PostBody;
  } catch {
    return badRequest('invalid JSON body');
  }

  const network: NetworkType = body.network === 'mainnet' ? 'mainnet' : 'testnet';

  try {
    switch (body.action) {
      case 'execute': {
        if (!Number.isInteger(body.lockId) || (body.lockId ?? 0) <= 0) {
          return badRequest('lockId must be a positive integer');
        }
        const hash = await executePurchase(body.lockId!, network);
        return json({ status: 'submitted', action: 'execute', lockId: body.lockId, hash }, 202);
      }
      case 'cancel': {
        if (!Number.isInteger(body.lockId) || (body.lockId ?? 0) <= 0) {
          return badRequest('lockId must be a positive integer');
        }
        const hash = await cancelLock(body.lockId!, network);
        return json({ status: 'submitted', action: 'cancel', lockId: body.lockId, hash }, 202);
      }
      case 'pause':
      case 'unpause': {
        const hash = await setBridgePaused(body.action === 'pause', network);
        return json({ status: 'submitted', action: body.action, hash }, 202);
      }
      case 'set-fee': {
        const { feeBps } = body;
        if (!Number.isInteger(feeBps) || (feeBps ?? 0) < 0 || (feeBps ?? 0) > 500) {
          return badRequest('feeBps must be an integer between 0 and 500');
        }
        const hash = await setBridgeFeeBps(feeBps!, network);
        return json({ status: 'submitted', action: 'set-fee', feeBps, hash }, 202);
      }
      case 'set-escrow': {
        const { escrow } = body;
        if (typeof escrow !== 'string' || !escrow.startsWith('C') || escrow.length !== 56) {
          return badRequest('escrow must be a 56-character contract address');
        }
        const hash = await setBridgeTreeEscrow(escrow, network);
        return json({ status: 'submitted', action: 'set-escrow', hash }, 202);
      }
      default:
        return badRequest(`unknown action: ${String(body.action)}`);
    }
  } catch (err) {
    return json(
      { error: 'bridge operation failed', detail: err instanceof Error ? err.message : String(err) },
      502,
    );
  }
}
