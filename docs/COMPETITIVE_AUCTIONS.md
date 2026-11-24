# Competitive auctions (issue #1404)

The marketplace now exposes a competitive-auction lifecycle in addition to the existing Dutch auction contract API.

## Lifecycle

1. `POST /api/marketplace/auctions` creates a full-lot auction with a reserve price and closing time.
2. `POST /api/marketplace/auctions/:id/bids` records a full-lot bid. A bid must meet the reserve and exceed the current leader; ties are rejected, so the leading bid is deterministic.
3. `GET /api/marketplace/auctions/:id` returns the public bid history and current leader for price discovery.
4. Once the end time passes, the seller calls `POST /api/marketplace/auctions/:id/finalize`. The highest bid becomes the winner and prior leaders remain refundable.

The service rejects seller self-bids, bids after close, non-increasing prices, invalid quantities, unauthorized finalization, and repeated refund withdrawal. Refunds are represented explicitly as `refundable`/`refunded` bid states so a payment adapter can safely connect the lifecycle to Stellar escrow in a later deployment step.

The repository is intentionally behind an interface (`InMemoryCompetitiveAuctionRepository`) while the existing marketplace contract is undergoing cleanup from historical merged feature branches. Before production settlement, replace the repository with a durable/PostgreSQL or Soroban escrow adapter and make finalization atomically transfer the winning payment and TREE credits. No API response claims that funds have moved on-chain.

## Review checklist

For an end-to-end review, create an auction with an end time in the future, place a reserve-meeting bid, and verify that a lower or equal bid returns a conflict. After the end time, finalize as the seller and verify that the winning bid is marked as won while earlier leaders are marked refundable. Requests using a non-seller finalizer, a seller bidder, an invalid quantity, or a closed auction should be rejected without mutating the auction state.

The current adapter is process-local, so these checks are suitable for API and contract-integration testing only. Production rollout must use a durable repository and an atomic escrow settlement boundary as described above.

## Security review notes

Reviewers should confirm that the eventual settlement adapter preserves seller and bidder authorization at the escrow boundary, performs reserve and slippage checks before token movement, and makes finalization plus refund-state transitions atomic.
