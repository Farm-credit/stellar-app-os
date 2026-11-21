import { processDueSettlements, type MarketplaceSettlement } from './settlement-service';

export async function runSettlementWorker(now = new Date()): Promise<MarketplaceSettlement[]> {
  const apiUrl = process.env.SETTLEMENT_API_URL;
  if (apiUrl) {
    const response = await fetch(`${apiUrl.replace(/\/$/, '')}/api/settlements/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.SETTLEMENT_WORKER_TOKEN
          ? { Authorization: `Bearer ${process.env.SETTLEMENT_WORKER_TOKEN}` }
          : {}),
      },
      body: JSON.stringify({ action: 'process_due', asOf: now.toISOString() }),
    });
    if (!response.ok) throw new Error(`Settlement API returned ${response.status}`);
    const payload = (await response.json()) as { settlements?: MarketplaceSettlement[] };
    return payload.settlements ?? [];
  }
  const settlements = await processDueSettlements(now);
  console.info('[settlement-worker] processed %d due settlements', settlements.length);
  return settlements;
}

if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  runSettlementWorker().catch((error) => {
    console.error('[settlement-worker] fatal', error);
    process.exit(1);
  });
}
