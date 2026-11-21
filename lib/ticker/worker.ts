import { createServer } from 'http';
import { createTickerServer } from '@/lib/ticker/tickerServer';
import { loadTickerConfig, validateTickerConfig } from '@/lib/ticker/config';
import { getTickerService } from '@/lib/ticker/tickerService';
import logger from '@/lib/logger';

async function main(): Promise<void> {
  const config = loadTickerConfig();
  const errors = validateTickerConfig(config);

  if (errors.length > 0) {
    for (const err of errors) {
      logger.error('ticker config validation error', { error: err });
    }
    process.exit(1);
  }

  const tickerService = getTickerService();

  const httpServer = createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          status: 'ok',
          timestamp: new Date().toISOString(),
          stats: tickerService.getStats(),
        })
      );
      return;
    }

    if (req.url === '/stats') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          service: tickerService.getStats(),
          market: tickerService.getMarketStats(),
        })
      );
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  const { io, shutdown } = createTickerServer({
    httpServer,
    config,
    tickerService,
  });

  await new Promise<void>((resolve) => {
    httpServer.listen(config.port, config.host, () => {
      resolve();
    });
  });

  logger.info('ticker server listening', {
    host: config.host,
    port: config.port,
    healthUrl: `http://${config.host === '0.0.0.0' ? 'localhost' : config.host}:${config.port}/health`,
    statsUrl: `http://${config.host === '0.0.0.0' ? 'localhost' : config.host}:${config.port}/stats`,
    simulateTrades: config.simulateTrades,
  });

  let isShuttingDown = false;
  async function gracefulShutdown(signal: string): Promise<void> {
    if (isShuttingDown) return;
    isShuttingDown = true;
    logger.info('received shutdown signal', { signal });
    await shutdown();
    process.exit(0);
  }

  process.on('SIGTERM', () => void gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => void gracefulShutdown('SIGINT'));

  process.on('uncaughtException', (err) => {
    logger.error('uncaught exception in ticker worker', { err });
    void gracefulShutdown('uncaughtException');
  });
  process.on('unhandledRejection', (reason) => {
    logger.error('unhandled rejection in ticker worker', { reason });
    void gracefulShutdown('unhandledRejection');
  });
}

main().catch((err) => {
  logger.error('ticker worker fatal error', { err });
  process.exit(1);
});
