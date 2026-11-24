import type { MarketplaceSettlement } from '@/lib/types/issue-1374-1377';
const settlements = new Map<string, MarketplaceSettlement>();
export const FARMER_PAYOUT_SHARE = 0.95;
export function resetSettlements() {
  settlements.clear();
}
export function recordMarketplacePurchase(input: {
  purchaseId: string;
  farmerId: string;
  buyerId: string;
  grossAmount: number;
  currency?: string;
  purchasedAt?: string;
}): MarketplaceSettlement {
  if (
    !input.purchaseId ||
    !input.farmerId ||
    !input.buyerId ||
    !Number.isFinite(input.grossAmount) ||
    input.grossAmount <= 0
  )
    throw new Error('purchaseId, farmerId, buyerId, and positive grossAmount are required');
  const existing = settlements.get(input.purchaseId);
  if (existing) return existing;
  const purchasedAt = input.purchasedAt ? new Date(input.purchasedAt) : new Date();
  const dueAt = new Date(purchasedAt.getTime() + 24 * 60 * 60 * 1000);
  const settlement: MarketplaceSettlement = {
    id: `settlement-${input.purchaseId}`,
    purchaseId: input.purchaseId,
    farmerId: input.farmerId,
    buyerId: input.buyerId,
    grossAmount: Number(input.grossAmount.toFixed(2)),
    farmerAmount: Number((input.grossAmount * FARMER_PAYOUT_SHARE).toFixed(2)),
    currency: input.currency ?? 'USDC',
    status: 'pending',
    dueAt: dueAt.toISOString(),
  };
  settlements.set(input.purchaseId, settlement);
  return settlement;
}
export async function processDueSettlements(
  now = new Date(),
  payout: (settlement: MarketplaceSettlement) => Promise<string> = (s) =>
    Promise.resolve(`simulated-${s.id}`)
): Promise<MarketplaceSettlement[]> {
  const due = [...settlements.values()].filter(
    (s) => s.status === 'pending' && new Date(s.dueAt) <= now
  );
  const processed: MarketplaceSettlement[] = [];
  for (const settlement of due) {
    settlement.status = 'processing';
    try {
      await payout(settlement);
      settlement.status = 'paid';
      settlement.paidAt = now.toISOString();
    } catch (error) {
      settlement.status = 'failed';
      settlement.failureReason = error instanceof Error ? error.message : 'Payout failed';
    }
    processed.push(settlement);
  }
  return processed;
}
export function listSettlements() {
  return [...settlements.values()];
}
