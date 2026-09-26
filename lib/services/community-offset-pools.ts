import type {
  CommunityOffsetPool,
  CreateOffsetPoolInput,
  OffsetPoolMember,
} from '@/lib/types/issue-1374-1377';
const pools = new Map<string, CommunityOffsetPool>();
let sequence = 0;
const money = (n: number) => Number(n.toFixed(2));
function shares(members: OffsetPoolMember[], total: number): OffsetPoolMember[] {
  return members.map((m) => ({
    ...m,
    sharePct: total ? Number(((m.contribution / total) * 100).toFixed(4)) : 0,
  }));
}
export function resetCommunityOffsetPools() {
  pools.clear();
  sequence = 0;
}
export function createCommunityOffsetPool(input: CreateOffsetPoolInput): CommunityOffsetPool {
  if (!input.name?.trim() || !input.creditListingId?.trim() || !input.wallet?.trim())
    throw new Error('name, creditListingId, and wallet are required');
  if (!Number.isFinite(input.targetAmount) || input.targetAmount <= 0)
    throw new Error('targetAmount must be greater than zero');
  const contribution = Math.min(Math.max(input.contribution ?? 0, 0), input.targetAmount);
  const now = new Date().toISOString();
  const id = `offset-pool-${++sequence}`;
  const member = {
    wallet: input.wallet,
    contribution,
    sharePct: contribution ? 100 : 0,
    joinedAt: now,
  };
  const pool: CommunityOffsetPool = {
    id,
    name: input.name.trim(),
    creditListingId: input.creditListingId,
    targetAmount: input.targetAmount,
    totalContributed: contribution,
    creditsPurchased: 0,
    status: contribution >= input.targetAmount ? 'funded' : 'open',
    members: contribution ? [member] : [],
    createdAt: now,
    ...(contribution >= input.targetAmount ? { fundedAt: now } : {}),
  };
  pools.set(id, pool);
  return pool;
}
export function contributeToCommunityOffsetPool(
  poolId: string,
  wallet: string,
  amount: number
): CommunityOffsetPool {
  const pool = pools.get(poolId);
  if (!pool) throw new Error('Pool not found');
  if (pool.status !== 'open') throw new Error('Pool is not open');
  if (!wallet || !Number.isFinite(amount) || amount <= 0)
    throw new Error('wallet and positive amount are required');
  const effective = Math.min(amount, pool.targetAmount - pool.totalContributed);
  const existing = pool.members.find((m) => m.wallet === wallet);
  if (existing) existing.contribution = money(existing.contribution + effective);
  else
    pool.members.push({
      wallet,
      contribution: effective,
      sharePct: 0,
      joinedAt: new Date().toISOString(),
    });
  pool.totalContributed = money(pool.members.reduce((sum, m) => sum + m.contribution, 0));
  pool.members = shares(pool.members, pool.totalContributed);
  if (pool.totalContributed >= pool.targetAmount) {
    pool.status = 'funded';
    pool.fundedAt = new Date().toISOString();
  }
  return pool;
}
export function purchasePoolCredits(poolId: string, credits: number): CommunityOffsetPool {
  const pool = pools.get(poolId);
  if (!pool) throw new Error('Pool not found');
  if (pool.status !== 'funded') throw new Error('Pool must be fully funded before purchase');
  if (!Number.isFinite(credits) || credits <= 0) throw new Error('credits must be positive');
  pool.creditsPurchased = credits;
  pool.status = 'purchased';
  return pool;
}
export function getCommunityOffsetPool(poolId: string) {
  return pools.get(poolId) ?? null;
}
export function listCommunityOffsetPools() {
  return [...pools.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
