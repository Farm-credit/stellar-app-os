import { RpcHealthMonitor } from './rpc-health';
import logger from '@/lib/logger';

const POLL_INTERVAL_MS = Number(process.env.RPC_MONITOR_POLL_INTERVAL_MS) || 30_000;

async function main(): Promise<void> {
  const monitor = new RpcHealthMonitor();
  const configs = monitor.getConfigs();

  if (configs.length === 0) {
    logger.error('[rpc-monitor] no RPC nodes configured. Set RPC_NODE_URLS.');
    process.exit(1);
  }

  logger.info('[rpc-monitor] starting', {
    nodes: configs.map((c) => c.name),
    pollIntervalMs: POLL_INTERVAL_MS,
  });

  while (true) {
    try {
      const state = await monitor.checkAll();
      logger.info('[rpc-monitor] check complete', {
        bestNode: state.bestNode?.name,
        bestLatencyMs: state.bestNode?.latencyMs,
        healthyCount: state.nodes.filter((n) => n.isHealthy).length,
      });

      for (const node of state.nodes) {
        if (!node.isHealthy) {
          logger.warn('[rpc-monitor] node unhealthy', {
            name: node.name,
            url: node.url,
            consecutiveFailures: node.consecutiveFailures,
            lastError: node.lastError,
          });
        }
      }
    } catch (err) {
      logger.error('[rpc-monitor] check error', { err });
    }

    await new Promise<void>((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

main().catch((err) => {
  logger.error('[rpc-monitor] fatal error', { err });
  process.exit(1);
});
