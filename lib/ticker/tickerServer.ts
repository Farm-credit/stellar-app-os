import type { Server as HttpServer } from 'http';
import type { Server as HttpsServer } from 'https';
import { Server as SocketIOServer, type Socket } from 'socket.io';
import type {
  TickerClientToServerEvents,
  TickerServerToClientEvents,
  TickerSocketData,
  CarbonCreditTradeFill,
} from '@/lib/types/ticker';
import type { TickerServerConfig } from '@/lib/ticker/config';
import { TickerService, type TickerServiceEvent } from '@/lib/ticker/tickerService';
import logger from '@/lib/logger';

export type TickerIOServer = SocketIOServer<
  TickerClientToServerEvents,
  TickerServerToClientEvents,
  Record<string, never>,
  TickerSocketData
>;

export type TickerSocket = Socket<
  TickerClientToServerEvents,
  TickerServerToClientEvents,
  Record<string, never>,
  TickerSocketData
>;

export interface CreateTickerServerOptions {
  httpServer?: HttpServer | HttpsServer;
  config: TickerServerConfig;
  tickerService?: TickerService;
}

interface SocketRateLimiter {
  timestamps: number[];
  events: Map<string, number[]>;
}

export function createTickerServer({
  httpServer,
  config,
  tickerService: externalService,
}: CreateTickerServerOptions): {
  io: TickerIOServer;
  tickerService: TickerService;
  shutdown: () => Promise<void>;
} {
  const tickerService = externalService ?? new TickerService();
  const rateLimiters = new WeakMap<TickerSocket, SocketRateLimiter>();

  const io: TickerIOServer = new SocketIOServer(httpServer, {
    cors: {
      origin: config.corsOrigin,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    perMessageDeflate: config.enableCompression
      ? {
          threshold: 1024,
        }
      : false,
    pingInterval: config.heartbeatIntervalMs,
    pingTimeout: Math.max(config.heartbeatIntervalMs * 2, 5000),
    maxHttpBufferSize: 1e6,
    connectionStateRecovery: {
      maxDisconnectionDuration: 2 * 60 * 1000,
      skipMiddlewares: true,
    },
  });

  let heartbeatTimer: NodeJS.Timeout | null = null;
  let broadcastTimer: NodeJS.Timeout | null = null;
  let tradeSimulatorTimer: NodeJS.Timeout | null = null;
  let serviceListener: ((ev: TickerServiceEvent) => void) | null = null;
  let isShuttingDown = false;

  const connectedSockets = new Set<TickerSocket>();

  function enforceRateLimit(socket: TickerSocket, eventName: string): boolean {
    let limiter = rateLimiters.get(socket);
    if (!limiter) {
      limiter = { timestamps: [], events: new Map() };
      rateLimiters.set(socket, limiter);
    }

    const now = Date.now();
    const windowStart = now - 1000;

    limiter.timestamps = limiter.timestamps.filter((t) => t >= windowStart);
    if (limiter.timestamps.length >= config.rateLimitPerSecond) {
      logger.warn('rate limit exceeded', { socketId: socket.id, eventName });
      socket.emit('error', 'Rate limit exceeded');
      return false;
    }
    limiter.timestamps.push(now);

    return true;
  }

  function checkMaxConnections(socket: TickerSocket): boolean {
    if (connectedSockets.size >= config.maxConnections) {
      logger.warn('max connections reached, rejecting socket', {
        socketId: socket.id,
        current: connectedSockets.size,
        max: config.maxConnections,
      });
      socket.emit('error', 'Server is at maximum capacity. Please try again later.');
      socket.disconnect(true);
      return false;
    }
    return true;
  }

  function handleServiceEvent(ev: TickerServiceEvent): void {
    switch (ev.type) {
      case 'trade:new':
        broadcastTradeNew(ev.trade);
        break;
      case 'trade:update':
        broadcastTradeUpdate(ev.trade);
        break;
      case 'ticker:update':
        break;
    }
  }

  function broadcastTradeNew(trade: CarbonCreditTradeFill): void {
    io.to(`listing:${trade.listingId}`).emit('trade:new', trade);
    io.to('market').emit('trade:new', trade);
  }

  function broadcastTradeUpdate(trade: CarbonCreditTradeFill): void {
    io.to(`listing:${trade.listingId}`).emit('trade:update', trade);
    io.to('market').emit('trade:update', trade);
  }

  function broadcastTicker(): void {
    if (connectedSockets.size === 0) return;

    const marketTicker = tickerService.getMarketTicker();

    io.to('market').emit('market:ticker', marketTicker);
    io.to('market').emit('ticker:update', marketTicker);

    for (const [listingId] of Object.entries(marketTicker.listings)) {
      const listingTicker = tickerService.getListingTicker(listingId);
      io.to(`listing:${listingId}`).emit('listing:ticker', listingTicker);
    }
  }

  function setupHeartbeat(): void {
    heartbeatTimer = setInterval(() => {
      const now = Date.now();
      for (const socket of connectedSockets) {
        socket.emit('pong', now);
      }
    }, config.heartbeatIntervalMs);
  }

  function simulateTrade(): void {
    const projectTypes = [
      'Reforestation',
      'Renewable Energy',
      'Mangrove Restoration',
      'Sustainable Agriculture',
    ];
    const verificationStatuses = [
      'Gold Standard',
      'Verra (VCS)',
      'Climate Action Reserve',
      'Plan Vivo',
    ];
    const locations = [
      'Amazon Basin, Brazil',
      'Sahara Desert, Morocco',
      'Indonesia Archipelago',
      'Kenya Highlands',
    ];
    const projectNames = [
      'Amazon Rainforest Reforestation',
      'Sahara Solar Farm Expansion',
      'Coastal Mangrove Restoration',
      'Smallholder Agroforestry',
    ];
    const listingIds = ['listing-001', 'listing-002', 'listing-003', 'listing-004'];

    const listingIdx = Math.floor(Math.random() * listingIds.length);
    const listingId = listingIds[listingIdx];

    tickerService.recordTrade({
      listingId,
      projectName: projectNames[listingIdx],
      projectType: projectTypes[Math.floor(Math.random() * projectTypes.length)],
      verificationStatus:
        verificationStatuses[Math.floor(Math.random() * verificationStatuses.length)],
      vintageYear: 2022 + Math.floor(Math.random() * 3),
      location: locations[Math.floor(Math.random() * locations.length)],
      buyerId: `buyer_${Math.floor(Math.random() * 1000)}`,
      sellerId: `seller_${Math.floor(Math.random() * 1000)}`,
      side: Math.random() > 0.5 ? 'buy' : 'sell',
      quantity: Math.floor(Math.random() * 500) + 1,
      pricePerTon: 8 + Math.random() * 20,
    });
  }

  function attachSocketHandlers(socket: TickerSocket): void {
    socket.data.subscribedListings = new Set();
    socket.data.subscribedMarket = false;
    socket.data.connectedAt = Date.now();

    socket.on('listing:subscribe', (listingId) => {
      if (!enforceRateLimit(socket, 'listing:subscribe')) return;
      if (!listingId || typeof listingId !== 'string') {
        socket.emit('error', 'Invalid listingId');
        return;
      }
      socket.data.subscribedListings.add(listingId);
      socket.join(`listing:${listingId}`);
      logger.debug('socket subscribed to listing', {
        socketId: socket.id,
        listingId,
      });
      const listingTicker = tickerService.getListingTicker(listingId);
      socket.emit('listing:ticker', listingTicker);
    });

    socket.on('listing:unsubscribe', (listingId) => {
      if (!enforceRateLimit(socket, 'listing:unsubscribe')) return;
      socket.data.subscribedListings.delete(listingId);
      socket.leave(`listing:${listingId}`);
      logger.debug('socket unsubscribed from listing', {
        socketId: socket.id,
        listingId,
      });
    });

    socket.on('market:subscribe', () => {
      if (!enforceRateLimit(socket, 'market:subscribe')) return;
      socket.data.subscribedMarket = true;
      socket.join('market');
      logger.debug('socket subscribed to market', { socketId: socket.id });
      const marketTicker = tickerService.getMarketTicker();
      socket.emit('market:ticker', marketTicker);
    });

    socket.on('market:unsubscribe', () => {
      if (!enforceRateLimit(socket, 'market:unsubscribe')) return;
      socket.data.subscribedMarket = false;
      socket.leave('market');
      logger.debug('socket unsubscribed from market', { socketId: socket.id });
    });

    socket.on('trades:recent', (limit) => {
      if (!enforceRateLimit(socket, 'trades:recent')) return;
      const safeLimit = typeof limit === 'number' ? Math.min(limit, 100) : 20;
      const recent = tickerService.getRecentTrades(safeLimit);
      socket.emit('trades:recent', recent);
    });

    socket.on('ping', (timestamp) => {
      socket.emit('pong', timestamp);
    });

    socket.on('disconnect', (reason) => {
      logger.info('socket disconnected', {
        socketId: socket.id,
        reason,
        connectedDurationMs: Date.now() - socket.data.connectedAt,
      });
      connectedSockets.delete(socket);
    });

    socket.on('error', (err) => {
      logger.error('socket error', { socketId: socket.id, err });
    });
  }

  io.on('connection', (socket: TickerSocket) => {
    if (isShuttingDown) {
      socket.disconnect(true);
      return;
    }

    if (!checkMaxConnections(socket)) return;

    connectedSockets.add(socket);

    logger.info('socket connected', {
      socketId: socket.id,
      totalConnections: connectedSockets.size,
      handshake: {
        address: socket.handshake.address,
        headers: Object.keys(socket.handshake.headers),
      },
    });

    attachSocketHandlers(socket);
  });

  serviceListener = handleServiceEvent;
  tickerService.on('event', serviceListener);

  setupHeartbeat();

  broadcastTimer = setInterval(() => {
    try {
      broadcastTicker();
    } catch (err) {
      logger.error('ticker broadcast error', { err });
    }
  }, config.broadcastIntervalMs);

  if (config.simulateTrades) {
    logger.info('trade simulation enabled', { intervalMs: config.simulateIntervalMs });
    tradeSimulatorTimer = setInterval(() => {
      try {
        simulateTrade();
      } catch (err) {
        logger.error('trade simulation error', { err });
      }
    }, config.simulateIntervalMs);
  }

  async function shutdown(): Promise<void> {
    isShuttingDown = true;
    logger.info('ticker server shutting down');

    if (tradeSimulatorTimer) {
      clearInterval(tradeSimulatorTimer);
      tradeSimulatorTimer = null;
    }
    if (broadcastTimer) {
      clearInterval(broadcastTimer);
      broadcastTimer = null;
    }
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
    if (serviceListener) {
      tickerService.off('event', serviceListener);
      serviceListener = null;
    }

    for (const socket of connectedSockets) {
      socket.disconnect(true);
    }
    connectedSockets.clear();

    await new Promise<void>((resolve) => {
      io.close(() => resolve());
    });

    logger.info('ticker server shutdown complete');
  }

  process.on('SIGTERM', () => {
    void shutdown().finally(() => process.exit(0));
  });
  process.on('SIGINT', () => {
    void shutdown().finally(() => process.exit(0));
  });

  logger.info('ticker server created', {
    port: config.port,
    hasHttpServer: !!httpServer,
  });

  return { io, tickerService, shutdown };
}
