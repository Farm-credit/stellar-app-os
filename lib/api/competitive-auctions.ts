import { randomUUID } from 'node:crypto';

export type AuctionStatus = 'open' | 'ended' | 'finalized' | 'cancelled';
export type BidStatus = 'leading' | 'outbid' | 'winner' | 'refundable' | 'refunded';

export interface CompetitiveBid {
  id: string;
  auctionId: string;
  bidder: string;
  quantity: number;
  pricePerCredit: number;
  totalPrice: number;
  createdAt: string;
  status: BidStatus;
}

export interface CompetitiveAuction {
  id: string;
  seller: string;
  projectId: string;
  quantity: number;
  reservePrice: number;
  endAt: string;
  createdAt: string;
  status: AuctionStatus;
  leadingBidId: string | null;
  bids: CompetitiveBid[];
}

export interface CreateAuctionInput {
  seller: string;
  projectId: string;
  quantity: number;
  reservePrice: number;
  endAt: string;
}

export interface PlaceBidInput {
  bidder: string;
  quantity: number;
  pricePerCredit: number;
}

export class AuctionValidationError extends Error {
  readonly code = 'INVALID_AUCTION_REQUEST';
}

export class AuctionNotFoundError extends Error {
  readonly code = 'AUCTION_NOT_FOUND';
}

export class AuctionConflictError extends Error {
  readonly code = 'AUCTION_CONFLICT';
}

function requireWallet(wallet: string, field: string): string {
  const value = wallet.trim();
  if (!value || value.length > 128) throw new AuctionValidationError(`${field} is required`);
  return value;
}

function parseEndAt(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.getTime() <= Date.now()) {
    throw new AuctionValidationError('endAt must be a future ISO date');
  }
  return date.toISOString();
}

export class InMemoryCompetitiveAuctionRepository {
  private readonly auctions = new Map<string, CompetitiveAuction>();

  create(input: CreateAuctionInput, now = new Date()): CompetitiveAuction {
    const seller = requireWallet(input.seller, 'seller');
    const projectId = input.projectId.trim();
    if (!projectId || projectId.length > 200)
      throw new AuctionValidationError('projectId is required');
    if (!Number.isSafeInteger(input.quantity) || input.quantity <= 0) {
      throw new AuctionValidationError('quantity must be a positive integer');
    }
    if (!Number.isFinite(input.reservePrice) || input.reservePrice <= 0) {
      throw new AuctionValidationError('reservePrice must be greater than zero');
    }
    const auction: CompetitiveAuction = {
      id: randomUUID(),
      seller,
      projectId,
      quantity: input.quantity,
      reservePrice: input.reservePrice,
      endAt: parseEndAt(input.endAt),
      createdAt: now.toISOString(),
      status: 'open',
      leadingBidId: null,
      bids: [],
    };
    this.auctions.set(auction.id, auction);
    return this.clone(auction);
  }

  get(id: string): CompetitiveAuction {
    const auction = this.auctions.get(id);
    if (!auction) throw new AuctionNotFoundError('Auction not found');
    this.refreshStatus(auction);
    return this.clone(auction);
  }

  list(): CompetitiveAuction[] {
    return [...this.auctions.values()].map((auction) => {
      this.refreshStatus(auction);
      return this.clone(auction);
    });
  }

  placeBid(id: string, input: PlaceBidInput, now = new Date()): CompetitiveBid {
    const auction = this.auctions.get(id);
    if (!auction) throw new AuctionNotFoundError('Auction not found');
    this.refreshStatus(auction, now);
    if (auction.status !== 'open')
      throw new AuctionConflictError('Auction is no longer accepting bids');
    const bidder = requireWallet(input.bidder, 'bidder');
    if (bidder === auction.seller)
      throw new AuctionConflictError('Seller cannot bid on own auction');
    if (input.quantity !== auction.quantity) {
      throw new AuctionValidationError('Competitive auctions require a bid for the full lot');
    }
    if (!Number.isSafeInteger(input.quantity) || input.quantity <= 0) {
      throw new AuctionValidationError('quantity must be a positive integer');
    }
    if (!Number.isFinite(input.pricePerCredit) || input.pricePerCredit < auction.reservePrice) {
      throw new AuctionValidationError('pricePerCredit must meet the reserve price');
    }
    const leader = auction.leadingBidId
      ? auction.bids.find((bid) => bid.id === auction.leadingBidId)
      : undefined;
    if (leader && input.pricePerCredit <= leader.pricePerCredit) {
      throw new AuctionConflictError('Bid must exceed the current leading bid');
    }
    if (leader) leader.status = 'refundable';
    const bid: CompetitiveBid = {
      id: randomUUID(),
      auctionId: id,
      bidder,
      quantity: input.quantity,
      pricePerCredit: input.pricePerCredit,
      totalPrice: input.quantity * input.pricePerCredit,
      createdAt: now.toISOString(),
      status: 'leading',
    };
    auction.bids.push(bid);
    auction.leadingBidId = bid.id;
    return { ...bid };
  }

  finalize(id: string, caller: string, now = new Date()): CompetitiveAuction {
    const auction = this.auctions.get(id);
    if (!auction) throw new AuctionNotFoundError('Auction not found');
    const wallet = requireWallet(caller, 'caller');
    if (wallet !== auction.seller)
      throw new AuctionConflictError('Only the seller can finalize an auction');
    this.refreshStatus(auction, now);
    if (auction.status === 'open') throw new AuctionConflictError('Auction has not ended');
    if (auction.status === 'finalized') return this.clone(auction);
    const leader = auction.leadingBidId
      ? auction.bids.find((bid) => bid.id === auction.leadingBidId)
      : undefined;
    if (leader) leader.status = 'winner';
    for (const bid of auction.bids)
      if (bid.id !== auction.leadingBidId && bid.status === 'refundable') bid.status = 'refundable';
    auction.status = 'finalized';
    return this.clone(auction);
  }

  withdrawRefund(id: string, bidId: string, caller: string): CompetitiveBid {
    const auction = this.auctions.get(id);
    if (!auction) throw new AuctionNotFoundError('Auction not found');
    const bid = auction.bids.find((candidate) => candidate.id === bidId);
    if (!bid) throw new AuctionNotFoundError('Bid not found');
    if (bid.bidder !== requireWallet(caller, 'caller'))
      throw new AuctionConflictError('Bidder does not own this bid');
    if (bid.status !== 'refundable') throw new AuctionConflictError('Bid is not refundable');
    bid.status = 'refunded';
    return { ...bid };
  }

  clear(): void {
    this.auctions.clear();
  }

  private refreshStatus(auction: CompetitiveAuction, now = new Date()): void {
    if (auction.status === 'open' && new Date(auction.endAt).getTime() <= now.getTime())
      auction.status = 'ended';
  }

  private clone(auction: CompetitiveAuction): CompetitiveAuction {
    return { ...auction, bids: auction.bids.map((bid) => ({ ...bid })) };
  }
}

export const competitiveAuctionRepository = new InMemoryCompetitiveAuctionRepository();
