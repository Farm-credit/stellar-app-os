import { refreshHealth } from './router';
import { loadHealthCheckConfig } from './config';

const config = loadHealthCheckConfig();

async function main() {
  console.info('[horizon-monitor] starting, check interval %dms', config.checkIntervalMs);

  await refreshHealth();
  console.info('[horizon-monitor] initial health check complete');

  while (true) {
    await new Promise<void>((resolve) => setTimeout(resolve, config.checkIntervalMs));

    try {
      await refreshHealth();
      console.info('[horizon-monitor] health check complete');
    } catch (err) {
      console.error('[horizon-monitor] health check error:', err);
    }
  }
}

main();
