import { beforeEach, describe, expect, it } from 'vitest';
import {
  AuctionConflictError,
  InMemoryCompetitiveAuctionRepository,
} from '../competitive-auctions';

const END = '2099-01-01T00:00:00.000Z';

describe('competitive auctions', () => {
  let repository: InMemoryCompetitiveAuctionRepository;

  beforeEach(() => {
    repository = new InMemoryCompetitiveAuctionRepository();
  });

  it('keeps the highest valid bid as the public leader and marks the prior bid refundable', () => {
    const auction = repository.create({
      seller: 'seller',
      projectId: 'project-1',
      quantity: 100,
      reservePrice: 10,
      endAt: END,
    });
    const first = repository.placeBid(auction.id, {
      bidder: 'buyer-a',
      quantity: 100,
      pricePerCredit: 12,
    });
    const second = repository.placeBid(auction.id, {
      bidder: 'buyer-b',
      quantity: 100,
      pricePerCredit: 15,
    });

    const current = repository.get(auction.id);
    expect(current.leadingBidId).toBe(second.id);
    expect(current.bids.find((bid) => bid.id === first.id)?.status).toBe('refundable');
    expect(current.bids.find((bid) => bid.id === second.id)?.status).toBe('leading');
  });

  it('rejects non-increasing bids and seller self-bids', () => {
    const auction = repository.create({
      seller: 'seller',
      projectId: 'project-1',
      quantity: 10,
      reservePrice: 10,
      endAt: END,
    });
    repository.placeBid(auction.id, { bidder: 'buyer-a', quantity: 10, pricePerCredit: 12 });
    expect(() =>
      repository.placeBid(auction.id, { bidder: 'buyer-b', quantity: 10, pricePerCredit: 12 })
    ).toThrow(AuctionConflictError);
    expect(() =>
      repository.placeBid(auction.id, { bidder: 'seller', quantity: 10, pricePerCredit: 20 })
    ).toThrow(AuctionConflictError);
  });

  it('finalizes only after close and makes the leader the winner', () => {
    const auction = repository.create({
      seller: 'seller',
      projectId: 'project-1',
      quantity: 10,
      reservePrice: 10,
      endAt: END,
    });
    const bid = repository.placeBid(auction.id, {
      bidder: 'buyer',
      quantity: 10,
      pricePerCredit: 20,
    });
    expect(() =>
      repository.finalize(auction.id, 'seller', new Date('2098-01-01T00:00:00Z'))
    ).toThrow(AuctionConflictError);
    const result = repository.finalize(auction.id, 'seller', new Date('2099-01-01T00:00:01Z'));
    expect(result.status).toBe('finalized');
    expect(result.bids.find((candidate) => candidate.id === bid.id)?.status).toBe('winner');
  });

  it('supports one-time refund withdrawal for an outbid bidder', () => {
    const auction = repository.create({
      seller: 'seller',
      projectId: 'project-1',
      quantity: 10,
      reservePrice: 10,
      endAt: END,
    });
    const oldBid = repository.placeBid(auction.id, {
      bidder: 'buyer-a',
      quantity: 10,
      pricePerCredit: 11,
    });
    repository.placeBid(auction.id, { bidder: 'buyer-b', quantity: 10, pricePerCredit: 12 });
    expect(repository.withdrawRefund(auction.id, oldBid.id, 'buyer-a').status).toBe('refunded');
    expect(() => repository.withdrawRefund(auction.id, oldBid.id, 'buyer-a')).toThrow(
      AuctionConflictError
    );
  });
});
