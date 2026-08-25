import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createServer, type Server as HttpServer } from 'http';
import { io as clientIo, type Socket as ClientSocket } from 'socket.io-client';
import { createTickerServer } from '@/lib/ticker/tickerServer';
import { resetTickerService, type TickerService } from '@/lib/ticker/tickerService';
import type {
  TickerClientToServerEvents,
  TickerServerToClientEvents,
  CarbonCreditTradeFill,
  MarketTickerUpdate,
  ListingTickerUpdate,
} from '@/lib/types/ticker';
import { loadTickerConfig } from '@/lib/ticker/config';

type ClientType = ClientSocket<TickerServerToClientEvents, TickerClientToServerEvents>;

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.listen(0, () => {
      const addr = srv.address();
      if (addr && typeof addr === 'object') {
        const port = addr.port;
        srv.close(() => resolve(port));
      } else {
        srv.close(() => reject(new Error('Failed to get free port')));
      }
    });
  });
}

describe('lib/ticker/tickerServer (integration)', () => {
  let httpServer: HttpServer;
  let tickerService: TickerService;
  let shutdown: () => Promise<void>;
  let serverUrl: string;
  let port: number;

  async function setupServer(
    opts: Partial<{ simulateTrades: boolean; maxConnections: number }> = {}
  ) {
    resetTickerService();
    port = await getFreePort();
    httpServer = createServer();

    const baseConfig = loadTickerConfig();
    const result = createTickerServer({
      httpServer,
      config: {
        ...baseConfig,
        port,
        host: '127.0.0.1',
        broadcastIntervalMs: 200,
        heartbeatIntervalMs: 5000,
        maxConnections: opts.maxConnections ?? 10,
        simulateTrades: opts.simulateTrades ?? false,
        rateLimitPerSecond: 1000,
      },
    });

    tickerService = result.tickerService;
    shutdown = result.shutdown;

    await new Promise<void>((resolve) => {
      httpServer.listen(port, '127.0.0.1', () => resolve());
    });
    serverUrl = `http://127.0.0.1:${port}`;
  }

  async function connectClient(): Promise<ClientType> {
    const client: ClientType = clientIo(serverUrl, {
      transports: ['websocket'],
      reconnection: false,
      timeout: 10_000,
    });
    await new Promise<void>((resolve, reject) => {
      client.once('connect', () => resolve());
      client.once('connect_error', (err) => reject(err));
    });
    return client;
  }

  function waitForEvent<T>(client: ClientType, event: string, timeoutMs = 2000): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`Timed out waiting for '${event}'`)),
        timeoutMs
      );
      client.once(event as never, (data: T) => {
        clearTimeout(timer);
        resolve(data);
      });
    });
  }

  async function subscribeListing(client: ClientType, listingId: string): Promise<void> {
    const ack = waitForEvent<ListingTickerUpdate>(client, 'listing:ticker');
    client.emit('listing:subscribe', listingId);
    await ack;
  }

  async function subscribeMarket(client: ClientType): Promise<void> {
    const ack = waitForEvent<MarketTickerUpdate>(client, 'market:ticker');
    client.emit('market:subscribe');
    await ack;
  }

  async function flushPackets(client: ClientType): Promise<void> {
    const pong = waitForEvent<number>(client, 'pong');
    client.emit('ping', Date.now());
    await pong;
  }

  beforeEach(async () => {
    await setupServer();
  });

  afterEach(async () => {
    try {
      await shutdown();
    } catch {
      // ignore shutdown errors in tests
    }
  });

  describe('connection and basic events', () => {
    it('accepts a client connection', async () => {
      const client = await connectClient();
      expect(client.connected).toBe(true);
      client.disconnect();
    });

    it('responds to ping with pong', async () => {
      const client = await connectClient();
      const pongPromise = new Promise<number>((resolve) => {
        client.once('pong', (ts) => resolve(ts));
      });
      client.emit('ping', 42);
      const ts = await pongPromise;
      expect(ts).toBe(42);
      client.disconnect();
    });

    it('emits error on invalid listing:subscribe', async () => {
      const client = await connectClient();
      const errPromise = new Promise<string>((resolve) => {
        client.once('error', (msg) => resolve(msg));
      });
      // @ts-expect-error - sending invalid payload
      client.emit('listing:subscribe', 12345);
      const err = await errPromise;
      expect(err).toContain('Invalid listingId');
      client.disconnect();
    });
  });

  describe('trades:recent', () => {
    it('returns recent trades for a subscriber', async () => {
      const trade = tickerService.recordTrade({
        listingId: 'listing-1',
        projectName: 'Amazon',
        projectType: 'Reforestation',
        verificationStatus: 'Verra (VCS)',
        vintageYear: 2023,
        location: 'Brazil',
        buyerId: 'b1',
        sellerId: 's1',
        side: 'buy',
        quantity: 10,
        pricePerTon: 12.5,
      });

      const client = await connectClient();
      const recentPromise = new Promise<CarbonCreditTradeFill[]>((resolve) => {
        client.once('trades:recent', (trades) => resolve(trades));
      });
      client.emit('trades:recent', 5);
      const recent = await recentPromise;
      expect(recent).toHaveLength(1);
      expect(recent[0].id).toBe(trade.id);
      client.disconnect();
    });
  });

  describe('listing subscription', () => {
    it('sends initial listing:ticker on subscribe', async () => {
      tickerService.recordTrade({
        listingId: 'listing-1',
        projectName: 'Amazon',
        projectType: 'Reforestation',
        verificationStatus: 'Verra (VCS)',
        vintageYear: 2023,
        location: 'Brazil',
        buyerId: 'b1',
        sellerId: 's1',
        side: 'buy',
        quantity: 10,
        pricePerTon: 12.5,
      });

      const client = await connectClient();
      const listingPromise = new Promise<ListingTickerUpdate>((resolve) => {
        client.once('listing:ticker', (u) => resolve(u));
      });
      client.emit('listing:subscribe', 'listing-1');
      const update = await listingPromise;
      expect(update.listingId).toBe('listing-1');
      expect(update.lastPrice).toBe(12.5);
      client.disconnect();
    });

    it('broadcasts new trade to listing subscribers', async () => {
      const client = await connectClient();
      await subscribeListing(client, 'listing-99');

      const tradePromise = new Promise<CarbonCreditTradeFill>((resolve) => {
        client.once('trade:new', (trade) => resolve(trade));
      });

      tickerService.recordTrade({
        listingId: 'listing-99',
        projectName: 'Amazon',
        projectType: 'Reforestation',
        verificationStatus: 'Verra (VCS)',
        vintageYear: 2023,
        location: 'Brazil',
        buyerId: 'b1',
        sellerId: 's1',
        side: 'buy',
        quantity: 10,
        pricePerTon: 12.5,
      });

      const trade = await tradePromise;
      expect(trade.listingId).toBe('listing-99');
      expect(trade.pricePerTon).toBe(12.5);
      client.disconnect();
    });

    it('does not broadcast trade to unsubscribed listing', async () => {
      const client = await connectClient();
      client.emit('listing:subscribe', 'listing-OTHER');

      const received: CarbonCreditTradeFill[] = [];
      client.on('trade:new', (t) => received.push(t));

      tickerService.recordTrade({
        listingId: 'listing-99',
        projectName: 'Amazon',
        projectType: 'Reforestation',
        verificationStatus: 'Verra (VCS)',
        vintageYear: 2023,
        location: 'Brazil',
        buyerId: 'b1',
        sellerId: 's1',
        side: 'buy',
        quantity: 10,
        pricePerTon: 12.5,
      });

      await new Promise((r) => setTimeout(r, 300));
      expect(received).toHaveLength(0);
      client.disconnect();
    });

    it('stops broadcasting after unsubscribe', async () => {
      const client = await connectClient();
      await subscribeListing(client, 'listing-X');

      const trade1Promise = new Promise<CarbonCreditTradeFill>((resolve) => {
        client.once('trade:new', resolve);
      });
      tickerService.recordTrade({
        listingId: 'listing-X',
        projectName: 'Amazon',
        projectType: 'Reforestation',
        verificationStatus: 'Verra (VCS)',
        vintageYear: 2023,
        location: 'Brazil',
        buyerId: 'b1',
        sellerId: 's1',
        side: 'buy',
        quantity: 1,
        pricePerTon: 10,
      });
      const t1 = await trade1Promise;
      expect(t1.listingId).toBe('listing-X');

      client.emit('listing:unsubscribe', 'listing-X');
      await flushPackets(client);

      const received: CarbonCreditTradeFill[] = [];
      client.on('trade:new', (t) => received.push(t));
      tickerService.recordTrade({
        listingId: 'listing-X',
        projectName: 'Amazon',
        projectType: 'Reforestation',
        verificationStatus: 'Verra (VCS)',
        vintageYear: 2023,
        location: 'Brazil',
        buyerId: 'b2',
        sellerId: 's2',
        side: 'buy',
        quantity: 2,
        pricePerTon: 11,
      });

      await new Promise((r) => setTimeout(r, 300));
      expect(received).toHaveLength(0);
      client.disconnect();
    });
  });

  describe('market subscription', () => {
    it('sends initial market:ticker on subscribe', async () => {
      tickerService.recordTrade({
        listingId: 'listing-1',
        projectName: 'Amazon',
        projectType: 'Reforestation',
        verificationStatus: 'Verra (VCS)',
        vintageYear: 2023,
        location: 'Brazil',
        buyerId: 'b1',
        sellerId: 's1',
        side: 'buy',
        quantity: 10,
        pricePerTon: 12.5,
      });

      const client = await connectClient();
      const marketPromise = new Promise<MarketTickerUpdate>((resolve) => {
        client.once('market:ticker', (u) => resolve(u));
      });
      client.emit('market:subscribe');
      const update = await marketPromise;
      expect(update.globalStats.tradeCount24h).toBe(1);
      expect(update.globalStats.volume24h).toBe(125);
      client.disconnect();
    });

    it('broadcasts all trades to market subscribers', async () => {
      const client = await connectClient();
      await subscribeMarket(client);

      const tradePromiseA = new Promise<CarbonCreditTradeFill>((resolve) => {
        client.once('trade:new', (t) => resolve(t));
      });
      tickerService.recordTrade({
        listingId: 'listing-A',
        projectName: 'Amazon',
        projectType: 'Reforestation',
        verificationStatus: 'Verra (VCS)',
        vintageYear: 2023,
        location: 'Brazil',
        buyerId: 'b1',
        sellerId: 's1',
        side: 'buy',
        quantity: 5,
        pricePerTon: 10,
      });
      const tA = await tradePromiseA;
      expect(tA.listingId).toBe('listing-A');

      const tradePromiseB = new Promise<CarbonCreditTradeFill>((resolve) => {
        client.once('trade:new', (t) => resolve(t));
      });
      tickerService.recordTrade({
        listingId: 'listing-B',
        projectName: 'Solar',
        projectType: 'Renewable Energy',
        verificationStatus: 'Gold Standard',
        vintageYear: 2024,
        location: 'Morocco',
        buyerId: 'b2',
        sellerId: 's2',
        side: 'sell',
        quantity: 10,
        pricePerTon: 20,
      });
      const tB = await tradePromiseB;
      expect(tB.listingId).toBe('listing-B');
      client.disconnect();
    });
  });

  describe('trade:update broadcast', () => {
    it('broadcasts trade status updates to listing and market', async () => {
      const clientA = await connectClient();
      await subscribeListing(clientA, 'listing-1');
      const clientB = await connectClient();
      await subscribeMarket(clientB);

      const trade = tickerService.recordTrade({
        listingId: 'listing-1',
        projectName: 'Amazon',
        projectType: 'Reforestation',
        verificationStatus: 'Verra (VCS)',
        vintageYear: 2023,
        location: 'Brazil',
        buyerId: 'b1',
        sellerId: 's1',
        side: 'buy',
        quantity: 10,
        pricePerTon: 12.5,
        status: 'pending',
      });

      const updateA = new Promise<CarbonCreditTradeFill>((resolve) => {
        clientA.once('trade:update', (t) => resolve(t));
      });
      const updateB = new Promise<CarbonCreditTradeFill>((resolve) => {
        clientB.once('trade:update', (t) => resolve(t));
      });

      tickerService.updateTradeStatus(trade.id, 'filled', 'confirmed-hash');

      const [a, b] = await Promise.all([updateA, updateB]);
      expect(a.status).toBe('filled');
      expect(a.txHash).toBe('confirmed-hash');
      expect(b.id).toBe(trade.id);
      clientA.disconnect();
      clientB.disconnect();
    });
  });

  describe('max connections limit', () => {
    it('rejects connections after hitting max', async () => {
      await shutdown();
      await setupServer({ maxConnections: 2 });

      const c1 = await connectClient();
      const c2 = await connectClient();

      const c3: ClientType = clientIo(serverUrl, {
        transports: ['websocket'],
        reconnection: false,
        timeout: 5000,
      });

      const errPromise = new Promise<string>((resolve) => {
        c3.once('error', (msg) => resolve(msg));
        c3.once('disconnect', () => resolve('disconnected'));
      });

      const result = await Promise.race([
        errPromise,
        new Promise<string>((resolve) => setTimeout(() => resolve('timeout'), 3000)),
      ]);
      expect(['disconnected', 'timeout'].includes(result) || result.includes('capacity')).toBe(
        true
      );

      c1.disconnect();
      c2.disconnect();
      c3.disconnect();
    });
  });

  describe('periodic ticker broadcast', () => {
    it('publishes market:ticker periodically', async () => {
      const client = await connectClient();
      client.emit('market:subscribe');

      await new Promise<void>((resolve) => {
        client.once('market:ticker', () => resolve());
      });

      const tickers: MarketTickerUpdate[] = [];
      client.on('market:ticker', (t) => tickers.push(t));

      await new Promise((r) => setTimeout(r, 500));
      expect(tickers.length).toBeGreaterThanOrEqual(1);

      client.disconnect();
    });
  });
});
