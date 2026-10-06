import { NextResponse } from 'next/server';
import {
  computeCollectiveBargainingTerms,
  createBargainingRound,
  finalizeBargainingRound,
  listBargainingRounds,
  submitBuyerOffer,
  voteOnOffer,
} from '@/lib/api/cooperatives';
import {
  cooperativeErrorResponse,
  invalidJsonResponse,
  readJsonBody,
} from '@/lib/api/cooperatives-http';
import type {
  BargainingVoteChoice,
  CreateBargainingRoundInput,
  SubmitBuyerOfferInput,
  VoteOnOfferInput,
} from '@/lib/types/cooperative';

export const runtime = 'nodejs';

interface BargainingRequestBody {
  action?: 'create_round' | 'submit_offer' | 'vote' | 'finalize';
  roundId?: string;
  targetQuantityTons?: number;
  deadlineHours?: number;
  buyerId?: string;
  buyerName?: string;
  pricePerTon?: number;
  quantityTons?: number;
  terms?: string;
  memberId?: string;
  vote?: BargainingVoteChoice;
}

/**
 * GET /api/cooperatives/:id/bargaining
 *
 * Lists every bargaining round plus the cooperative's current terms.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    return NextResponse.json({
      success: true,
      rounds: listBargainingRounds(id),
      terms: computeCollectiveBargainingTerms(id),
    });
  } catch (error) {
    return cooperativeErrorResponse(error);
  }
}

/**
 * POST /api/cooperatives/:id/bargaining
 *
 * Action-dispatched bargaining endpoint:
 *  - `create_round`  → opens a new negotiation round
 *  - `submit_offer`  → records a buyer offer on a round
 *  - `vote`          → records a member vote (quorum resolves the round)
 *  - `finalize`      → tallies votes once quorum is reached
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await readJsonBody<BargainingRequestBody>(request);
    if (!body) return invalidJsonResponse();

    switch (body.action) {
      case 'create_round': {
        const input: CreateBargainingRoundInput = {
          targetQuantityTons: body.targetQuantityTons,
          deadlineHours: body.deadlineHours,
        };
        const round = createBargainingRound(id, input);
        return NextResponse.json(
          { success: true, round, terms: computeCollectiveBargainingTerms(id) },
          { status: 201 }
        );
      }

      case 'submit_offer': {
        if (!body.roundId) {
          return NextResponse.json({ success: false, error: 'roundId is required' }, { status: 400 });
        }
        const input: SubmitBuyerOfferInput = {
          buyerId: body.buyerId ?? '',
          buyerName: body.buyerName,
          pricePerTon: Number(body.pricePerTon),
          quantityTons: Number(body.quantityTons),
          terms: body.terms,
        };
        const round = submitBuyerOffer(id, body.roundId, input);
        return NextResponse.json({ success: true, round });
      }

      case 'vote': {
        if (!body.roundId) {
          return NextResponse.json({ success: false, error: 'roundId is required' }, { status: 400 });
        }
        const input: VoteOnOfferInput = {
          memberId: body.memberId ?? '',
          vote: body.vote as BargainingVoteChoice,
        };
        const round = voteOnOffer(id, body.roundId, input);
        return NextResponse.json({ success: true, round });
      }

      case 'finalize': {
        if (!body.roundId) {
          return NextResponse.json({ success: false, error: 'roundId is required' }, { status: 400 });
        }
        const round = finalizeBargainingRound(id, body.roundId);
        return NextResponse.json({ success: true, round });
      }

      default:
        return NextResponse.json(
          {
            success: false,
            error: 'Invalid action. Supported: create_round, submit_offer, vote, finalize',
          },
          { status: 400 }
        );
    }
  } catch (error) {
    return cooperativeErrorResponse(error);
  }
}
