import type {
  CommunityOffsetPool,
  CommunityPoolMember,
  CreateCommunityPoolInput,
  JoinCommunityPoolInput,
} from '@/lib/types/community-offset-pool';
const pools = new Map<string, CommunityOffsetPool>();
const round = (value: number, digits = 7) => Number(value.toFixed(digits));
function shares(members: CommunityPoolMember[], total: number) {
  return members.map((member) => ({
    ...member,
    sharePercent: total ? round((member.contribution / total) * 100, 4) : 0,
  }));
}
export function createCommunityPool(input: CreateCommunityPoolInput): CommunityOffsetPool {
  if (!input.name.trim() || !input.creditProject.trim() || !input.creatorWallet.trim())
    throw new Error('name, creditProject, and creatorWallet are required');
  if (input.targetAmount <= 0 || input.pricePerCredit <= 0)
    throw new Error('targetAmount and pricePerCredit must be greater than zero');
  const contribution = Math.min(Math.max(input.initialContribution ?? 0, 0), input.targetAmount);
  const member: CommunityPoolMember = {
    wallet: input.creatorWallet,
    contribution,
    sharePercent: contribution ? 100 : 0,
    creditsAllocated: 0,
    joinedAt: new Date().toISOString(),
  };
  const id = `community_pool_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const pool: CommunityOffsetPool = {
    id,
    name: input.name,
    description: input.description,
    creditProject: input.creditProject,
    targetAmount: input.targetAmount,
    totalContributed: contribution,
    remainingAmount: round(input.targetAmount - contribution),
    pricePerCredit: input.pricePerCredit,
    estimatedCredits: round(input.targetAmount / input.pricePerCredit),
    status: contribution >= input.targetAmount ? 'funded' : 'open',
    members: [member],
    deadline: input.deadline,
    createdAt: new Date().toISOString(),
  };
  pools.set(id, pool);
  return pool;
}
export function joinCommunityPool(input: JoinCommunityPoolInput) {
  const pool = pools.get(input.poolId);
  if (!pool) throw new Error('Community pool not found');
  if (pool.status !== 'open') throw new Error('Community pool is not open');
  if (input.amount <= 0) throw new Error('amount must be greater than zero');
  const amount = Math.min(input.amount, pool.remainingAmount);
  const existing = pool.members.find((member) => member.wallet === input.wallet);
  if (existing) existing.contribution = round(existing.contribution + amount);
  else
    pool.members.push({
      wallet: input.wallet,
      contribution: amount,
      sharePercent: 0,
      creditsAllocated: 0,
      joinedAt: new Date().toISOString(),
    });
  pool.totalContributed = round(pool.members.reduce((sum, member) => sum + member.contribution, 0));
  pool.remainingAmount = round(Math.max(0, pool.targetAmount - pool.totalContributed));
  pool.members = shares(pool.members, pool.totalContributed);
  if (pool.remainingAmount === 0) {
    pool.status = 'funded';
    pool.members = pool.members.map((member) => ({
      ...member,
      creditsAllocated: round((member.sharePercent / 100) * pool.estimatedCredits),
    }));
  }
  pools.set(pool.id, pool);
  return pool;
}
export function listCommunityPools(status?: CommunityOffsetPool['status']) {
  return [...pools.values()]
    .filter((pool) => !status || pool.status === status)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export function getCommunityPool(id: string) {
  return pools.get(id) ?? null;
}
