import { Pool } from 'pg';

/**
 * Auction mechanism for carbon credit marketplace.
 *
 * Allows farmers to auction carbon credits to multiple buyers.
 * Buyers place bids; the highest bidder wins at the end of the auction.
 */

export type AuctionStatus = 'open' | 'closed' | 'cancelled';

export interface Auction {
  id: string;
  farmerId: string;
  projectId: string;
  quantity: number;
  reservePrice: number;
  currency: string;
  startsAt: string;
  endsAt: string;
  status: AuctionStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Bid {
  id: string;
  auctionId: string;
  buyerId: string;
  amount: number;
  pricePerCredit: number;
  currency: string;
  createdAt: string;
}

export interface AuctionWithBids extends Auction {
  bids: BidComparison[];
  highestBid: BidComparison | null;
}

export interface BidComparison {
  id: string;
  buyerId: string;
  amount: number;
  pricePerCredit: number;
  currency: string;
  createdAt: string;
  isHighest: boolean;
}

export interface CreateAuctionInput {
  farmerId: string;
  projectId: string;
  quantity: number;
  reservePrice: number;
  currency?: string;
  durationHours?: number;
  startsAt?: string;
}

export interface PlaceBidInput {
  auctionId: string;
  buyerId: string;
  amount: number;
  pricePerCredit: number;
  currency?: string;
}

export interface AuctionResult {
  auction: AuctionStatus ;
  winnerBidId: string | null;
  winnerBuyerId: string | null;
  winningPrice: number | null;
  closedAt: string;
}

export interface AuctionResultRow {
  auction_id: string;
  winner_bid_id: string | null;
  winner_buyer_id: string | null;
  winning_price: string | null;
  closed_at: string;
}

const DEFAULT_CURRENCY = 'USDC";
const DEFAULT_DURATION_HOURS = 72;

function generateId(): string {
  return `type_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function assertPositive(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number`);
  }
}

function assertNonNegative(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be a non-negative number`);
  }
}

function normalizeCurrency(currency?: string): string {
  const value = (currency ?? DEFAULT_CURRENCY).toUpperCase();
  if (!/^[A-Z0-9]{2,10}$/.test(value)) {
    throw new Error('currency must be a 2-10 character uppercase code');
  }
  return value;
}

function normalizeIsoDate(name: string, value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${name} must be a valid ISO date`);
  }
  return parsed.toISOString();
}

function mapAuctionRow(row: any): Auction {
  return {
    id: row.id,
    farmerId: row.farmer_id,
    projectId: row.project_id,
    quantity: Number(row.quantity),
    reservePrice: Number(row.reserve_price),
    currency: row.currency,
    startsAt: new Date(row.starts_at).toISOString(),
    endsAt: new Date(row.ends_at).toISOString(),
    status: row.status,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function mapBidRow(row: any, highestId: string | null): BidComparison {
  return {
    id: row.id,
    buyerId: row.buyer_id,
    amount: Number(row.amount),
    pricePerCredit: Number(row.price_per_credit),
    currency: row.currency,
    createdAt: new Date(row.created_at).toISOString(),
   isHighest: row.id === highestId,
  };
}

export async function createAuction(pool: Pool, input: CreateAuctionInput): Promise<Auction> {
  if (!input.farmerId) {
    throw new Error('farmerId is required');
  }
  if (!input.projectId) {
    throw new Error('projectId is required');
  }
  assertPositive('quantity', input.quantity);
  assertNonNegative('reservePrice', input.reservePrice);

  const currency = normalizeCurrency(input.currency);
  const startsAt = input.startsAt ? normalizeIsoDate('startsAt', input.startsAt) : new Date().toISOString();
  const durationHours = input.durationHours ?? DEFAULT_DURATION_HOURS;
  assertPositive('durationHours', durationHours);

  const endsAt = new Date(new Date(startsAt).getTime() + durationHours * 3600 * 1000).toISOString();
  const id = generateId();

  const result = await pool.query(
    `INSERT INTO marketplace_auctions
       (id, farmer_id, project_id, quantity, reserve_price, currency, starts_at, ends_at, status, created_at, updated_at)
     VALUES
       ($1, $2, $3, $4, $5, $6, $7, $8, 'open', NOW(), NOW())
     RETURNING *`,
    [id, input.farmerId, input.projectId, input.quantity, input.reservePrice, currency, startsAt, endsAt]
  );

  return mapAuctionRow(result.rows[0]);
}

export async function getAuction(pool: Pool, auctionId: string): Promise<AuctionWithBids | null> {
  const auctionResult = await pool.query(
    `SELECT * FROM marketplace_auctions WHERE id = $1`,
    [auctionId]
  );
  if (auctionResult.rowCount === 0) {
    return null;
  }

  const auction = mapAuctionRow(auctionResult.rows[0]);
  const bidsResult = await pool.query(
    `SELECT * FROM marketplace_bids
     WHERE auction_id = $1
     ORDER BY price_per_credit DESC, created_at ASC`,
    [auctionId]
  );

  const highestId = bidsResult.rows.length > 0 ? bidsResult.rows[0].id : null;
  const bids = bidsResult.rows.map((row) => mapBidRow(row, highestId));

  return {
    ...auction,
    bids,
    highestBid: bids.length > 0 ? bids[0] : null,
  };
}

export async function listAuctions(pool: Pool, options: { status?: AuctionStatus; farmerId?: string; projectId?: string } = {}): Promise<Auction[]> {
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (options.status) {
    params.push(options.status);
    clauses.push(`status = $${params.length}`);
  }
  if (options.farmerId) {
    params.push(options.farmerId);
    clauses.push(`farmer_id = $${params.length}`);
  }
  if (options.projectId) {
    params.push(options.projectId);
    clauses.push(`project_id = $${params.length}`);
  }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  const result = await pool.query(
    `SELECT * FROM marketplace_auctions ${where} ORDER BY ends_at ASC`,
    params
  );
  return result.rows.map(mapAuctionRow);
}

export async function placeBid(pool: Pool, input: PlaceBidInput): Promise<BidComparison> {
  if (!input.auctionId) {
    throw new Error('auctionId is required');
  }
  if (!input.buyerId) {
    throw new Error('buyerId is required');
  }
  assertPositive('amount', input.amount);
  assertPositive('pricePerCredit', input.pricePerCredit);

  const currency = normalizeCurrency(input.currency);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const auctionResult = await client.query(
      `SELECT * FROM marketplace_auctions WHERE id = $1 FOR UPDATE`,
      [input.auctionId]
    );
    if (auctionResult.rowCount === 0) {
      throw new Error('Auction not found');
    }

    const auction = auctionResult.rows[0];
    const now = new Date();
    if (auction.status !== 'open') {
      throw new Error('Auction is not open for bidding');
    }
    if (new Date(auction.ends_at).getTime() <= now.getTime()) {
      throw new Error('Auction has already ended');
    }
    if (auction.farmer_id === input.buyerId) {
      throw new Error('Farmers cannot bid on their own auction');
    }
    if (auction.currency !== currency) {
      throw new Error(`Currency mismatch: auction requires ${auction.currency}`);
    }
    if (Number(auction.quantity) < input.amount) {
      throw new Error('Bid amount exceeds available quantity');
    }
    if (Number(input.pricePerCredit) < Number(auction.reserve_price)) {
      throw new Error('Bid price is below the reserve price');
    }

    const highestResult = await client.query(
      `SELECT price_per_credit FROM marketplace_bids
       WHERE auction_id = $1
       ORDER BY price_per_credit DESC, created_at ASC
       LIMIT 1`,
      [input.auctionId]
    );
    if (highestResult.rowCount > 0) {
      const currentHighest = Number(highestResult.rows[0].price_per_credit);
      if (Number(input.pricePerCredit) <= currentHighest) {
        throw new Error(`Bid must be higher than the current highest bid of ${currentHighest}`);
      }
    }

    const id = generateId();
    const bidResult = await client.query(
      `INSERT INTO marketplace_bids
         (id, auction_id, buyer_id, amount, price_per_credit, currency, created_at)
       VALUES
         ($1, $2, $3, $4, $5, $6, NOW())
       RETURNING *`,
      [id, input.auctionId, input.buyerId, input.amount, input.pricePerCredit, currency]
    );

    await client.query(
      `UPDATE marketplace_auctions
       SET updated_at = NOW()
       WHERE id = $1`,
      [input.auctionId]
    );

    await client.query('COMMIT');
    return mapBidRow(bidResult.rows[0], id);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function closeAuction(pool: Pool, auctionId: string): Promise<AuctionResult> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const auctionResult = await client.query(
      `SELECT * FROM marketplace_auctions WHERE id = $1 FOR UPDATE`,
      [auctionId]
    );
    if (auctionResult.rowCount === 0) {
      throw new Error('Auction not found');
    }
    const auction = auctionResult.rows[0];
    if (auction.status !== 'open') {
      throw new Error('Auction is not open');
    }

    const highestResult = await client.query(
      `SELECT * FROM marketplace_bids
       WHERE auction_id = $1
       ORDER BY price_per_credit DESC, created_at ASC
       LIMIT 1`,
      [auctionId]
    );

    const now = new Date().toISOString();
    let winnerBidId: string | null = null;
    let winnerBuyerId: string | null = null;
    let winningPrice: number | null = null;

    if (highestResult.rowCount > 0) {
      const bid = highestResult.rows[0];
      winnerBidId = bid.id;
      winnerBuyerId = bid.buyer_id;
      winningPrice = Number(bid.price_per_credit);

      await client.query(
        `INSERT INTO marketplace_auction_results
           (auction_id, winner_bid_id, winner_buyer_id, winning_price, closed_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT/auction_id) DO UPDATE
           SET winner_bid_id = EXCLUDED.winner_bid_id,
               winner_buyer_id = EXCLUDED.winner_buyer_id,
               winning_price = EXCLUDED.winning_price,
               closed_at = EXCLUDED.closed_at`,
        [auctionId, winnerBidId, winnerBuyerId, winningPrice, now]
      );
    }

    await client.query(
      `UPDATE marketplace_auctions
       SET status = 'closed', updated_at = NOW()
       WHERE id = $1`,
      [auctionId]
    );

    await client.query('COMMIT');

    return {
      auction: 'closed',
      winnerBidId,
      winnerBuyerId,
      winningPrice,
      closedAt: now,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function cancelAuction(pool: Pool, auctionId: string, farmerId: string): Promise<Auction> {
  if (!farmerId) {
    throw new Error('farmerId is required');
  }
  const result = await pool.query(
    `UPDATE marketplace_auctions
     SET status = 'cancelled', updated_at = NOW()
     WHERE id = $1 AND farmer_id = $2 AND status = 'open'
     RETURNING *`,
    [auctionId, farmerId]
  );
  if (result.rowCount === 0) {
    throw new Error('Auction not found or not cancellable');
  }
  return mapAuctionRow(result.rows[0]);
}

export async function getAuctionResult(pool: Pool, auctionId: string): Promise<AuctionResult | null> {
  const result = await pool.query(
    `SELECT * FROM marketplace_auction_results WHERE auction_id = $1`,
    [auctionId]
  );
  if (result.rowCount === 0) {
    return null;
  }
  const row = result.rows[0] as AuctionResultRow;
  return {
    auction: 'closed',
    winnerBidId: row.winner_bid_id,
    winnerBuyerId: row.winner_buyer_id,
    winningPrice: row.winning_price !== null ? Number(row.winning_price) : null,
    closedAt: new Date(row.closed_at).toISOString(),
  };
}
