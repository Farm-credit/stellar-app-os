/**
 * Farmer cooperative service — Issue #1431
 *
 * Implements cooperative formation, project pooling and collective bargaining
 * for the farmer marketplace:
 *
 *  - forming a cooperative and managing membership (founder / admin / member)
 *  - pooling marketplace projects contributed by members
 *  - evaluating the pool against a tiered volume-discount curve
 *  - running bargaining rounds: buyer offers, member voting, quorum resolution
 *
 * Persistence is an in-process Map so the feature works in dev and unit tests
 * without a database. Every public function below is storage agnostic — swap
 * the `store` for the Postgres/Prisma layer in production without changing the
 * routes or the hooks.
 */

import { mockCarbonProjects } from '@/lib/api/mock/carbonProjects';
import type {
  AddMemberInput,
  AddPooledProjectInput,
  BargainingRound,
  CollectiveBargainingTerms,
  Cooperative,
  CooperativeMember,
  CooperativeStatus,
  CooperativeSummary,
  CreateBargainingRoundInput,
  CreateCooperativeInput,
  DiscountTier,
  ListCooperativesFilter,
  PooledProject,
  SubmitBuyerOfferInput,
  VoteOnOfferInput,
} from '@/lib/types/cooperative';

// ── Constants ─────────────────────────────────────────────────────────────────

export const DEFAULT_MIN_MEMBERS_TO_BARGAIN = 3;
export const DEFAULT_BARGAINING_QUORUM_PERCENT = 60;
export const DEFAULT_BARGAINING_DEADLINE_HOURS = 72;

/**
 * Volume-discount curve applied to the pooled quantity. Tier boundaries are
 * inclusive lower bounds; a pool that exactly hits 1 000 t unlocks 6 %.
 */
export const COOPERATIVE_DISCOUNT_TIERS: readonly DiscountTier[] = [
  { minTons: 0, discountPercent: 0 },
  { minTons: 500, discountPercent: 3 },
  { minTons: 1_000, discountPercent: 6 },
  { minTons: 2_500, discountPercent: 10 },
  { minTons: 5_000, discountPercent: 15 },
  { minTons: 10_000, discountPercent: 20 },
];

// ── Errors ────────────────────────────────────────────────────────────────────

/** Domain error carrying the HTTP status the route layer should return. */
export class CooperativeError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 400, code = 'invalid_request') {
    super(message);
    this.name = 'CooperativeError';
    this.status = status;
    this.code = code;
  }
}

function invalid(message: string): CooperativeError {
  return new CooperativeError(message, 400, 'invalid_request');
}

function notFound(message: string): CooperativeError {
  return new CooperativeError(message, 404, 'not_found');
}

function conflict(message: string): CooperativeError {
  return new CooperativeError(message, 409, 'conflict');
}

function forbidden(message: string): CooperativeError {
  return new CooperativeError(message, 403, 'forbidden');
}

// ── Store (swap for a database in production) ─────────────────────────────────

const store: { cooperatives: Map<string, Cooperative>; seq: number } = {
  cooperatives: new Map(),
  seq: 0,
};

/** Clears all cooperative state. Used by tests; never call in production code. */
export function resetCooperativeStore(): void {
  store.cooperatives.clear();
  store.seq = 0;
}

function nextId(prefix: string): string {
  store.seq += 1;
  return `${prefix}-${store.seq}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

// ── Tier helpers ──────────────────────────────────────────────────────────────

/** Highest tier unlocked at `quantityTons`. */
export function getDiscountTier(quantityTons: number): DiscountTier {
  let match: DiscountTier = COOPERATIVE_DISCOUNT_TIERS[0];
  for (const tier of COOPERATIVE_DISCOUNT_TIERS) {
    if (quantityTons >= tier.minTons) match = tier;
  }
  return match;
}

/** Next tier above `quantityTons`, or null when already at the top tier. */
export function getNextDiscountTier(quantityTons: number): DiscountTier | null {
  for (const tier of COOPERATIVE_DISCOUNT_TIERS) {
    if (tier.minTons > quantityTons) return tier;
  }
  return null;
}

// ── Internal accessors ────────────────────────────────────────────────────────

function recomputeStatus(cooperative: Cooperative): void {
  if (cooperative.status === 'suspended') return;
  cooperative.status =
    cooperative.members.length >= cooperative.minMembersToBargain ? 'active' : 'forming';
}

function requireCooperative(cooperativeId: string): Cooperative {
  const cooperative = store.cooperatives.get(cooperativeId);
  if (!cooperative) throw notFound(`Cooperative ${cooperativeId} not found`);
  return cooperative;
}

function findMember(cooperative: Cooperative, memberId: string): CooperativeMember | undefined {
  return cooperative.members.find((member) => member.userId === memberId);
}

function isAdmin(cooperative: Cooperative, memberId: string): boolean {
  const role = findMember(cooperative, memberId)?.role;
  return role === 'founder' || role === 'admin';
}

function requireRound(cooperative: Cooperative, roundId: string): BargainingRound {
  const round = cooperative.bargainingRounds.find((candidate) => candidate.id === roundId);
  if (!round) throw notFound(`Bargaining round ${roundId} not found`);
  return round;
}

/** Marks in-flight rounds whose deadline has passed as expired. */
function refreshExpiredRounds(cooperative: Cooperative): void {
  const now = Date.now();
  for (const round of cooperative.bargainingRounds) {
    if (round.status !== 'open' && round.status !== 'offer_received') continue;
    if (Date.parse(round.deadline) < now) {
      round.status = 'expired';
      round.resolvedAt = nowIso();
      cooperative.updatedAt = round.resolvedAt;
    }
  }
}

function pooledQuantityTons(cooperative: Cooperative): number {
  return round2(cooperative.pooledProjects.reduce((sum, item) => sum + item.quantityTons, 0));
}

export function getQuorumRequired(cooperative: Cooperative): number {
  return Math.max(
    1,
    Math.ceil((cooperative.members.length * cooperative.bargainingQuorumPercent) / 100)
  );
}

// ── Bargaining term maths ─────────────────────────────────────────────────────

function buildTerms(cooperative: Cooperative, targetQuantityTons?: number): CollectiveBargainingTerms {
  const pooled = pooledQuantityTons(cooperative);
  const pricedTotal = cooperative.pooledProjects.reduce(
    (sum, item) => sum + item.quantityTons * item.pricePerTon,
    0
  );
  const blendedPricePerTon = pooled > 0 ? round4(pricedTotal / pooled) : 0;

  const evaluatedQuantity =
    typeof targetQuantityTons === 'number' && targetQuantityTons > 0 ? targetQuantityTons : pooled;
  const tier = evaluatedQuantity > 0 ? getDiscountTier(evaluatedQuantity) : null;
  const discountPercent = tier ? tier.discountPercent : 0;

  const effectivePricePerTon = round2(blendedPricePerTon * (1 - discountPercent / 100));
  const estimatedTotal = round2(effectivePricePerTon * pooled);
  const listTotal = round2(blendedPricePerTon * pooled);
  const next = getNextDiscountTier(evaluatedQuantity);

  return {
    pooledQuantityTons: pooled,
    memberCount: cooperative.members.length,
    minMembersToBargain: cooperative.minMembersToBargain,
    meetsMemberMinimum: cooperative.members.length >= cooperative.minMembersToBargain,
    tier,
    discountPercent,
    blendedPricePerTon,
    effectivePricePerTon,
    estimatedTotal,
    estimatedSavings: round2(listTotal - estimatedTotal),
    missingTonsForNextTier: next ? round2(next.minTons - evaluatedQuantity) : null,
  };
}

/** Collective bargaining position for a cooperative (optionally a what-if target). */
export function computeCollectiveBargainingTerms(
  cooperativeId: string,
  targetQuantityTons?: number
): CollectiveBargainingTerms {
  const cooperative = requireCooperative(cooperativeId);
  refreshExpiredRounds(cooperative);
  return buildTerms(cooperative, targetQuantityTons);
}

// ── Cooperative formation & membership ────────────────────────────────────────

export function createCooperative(input: CreateCooperativeInput): Cooperative {
  const name = (input.name ?? '').trim();
  if (name.length < 3) throw invalid('Cooperative name must be at least 3 characters');

  const founderId = (input.founderId ?? '').trim();
  if (!founderId) throw invalid('founderId is required');

  const minMembers = input.minMembersToBargain ?? DEFAULT_MIN_MEMBERS_TO_BARGAIN;
  if (!Number.isInteger(minMembers) || minMembers < 2) {
    throw invalid('minMembersToBargain must be an integer of at least 2');
  }

  const quorum = input.bargainingQuorumPercent ?? DEFAULT_BARGAINING_QUORUM_PERCENT;
  if (typeof quorum !== 'number' || !Number.isFinite(quorum) || quorum <= 0 || quorum > 100) {
    throw invalid('bargainingQuorumPercent must be between 1 and 100');
  }

  const timestamp = nowIso();
  const founder: CooperativeMember = {
    userId: founderId,
    name: (input.founderName ?? founderId).trim() || founderId,
    role: 'founder',
    walletAddress: input.walletAddress,
    joinedAt: timestamp,
    contributedTons: 0,
  };

  const cooperative: Cooperative = {
    id: nextId('coop'),
    name,
    description: (input.description ?? '').trim(),
    region: (input.region ?? 'Unspecified').trim() || 'Unspecified',
    status: 'forming',
    founderId,
    members: [founder],
    pooledProjects: [],
    bargainingRounds: [],
    minMembersToBargain: minMembers,
    bargainingQuorumPercent: quorum,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  recomputeStatus(cooperative);
  store.cooperatives.set(cooperative.id, cooperative);
  return clone(cooperative);
}

export function getCooperative(cooperativeId: string): Cooperative {
  const cooperative = requireCooperative(cooperativeId);
  refreshExpiredRounds(cooperative);
  return clone(cooperative);
}

export function listCooperatives(filter: ListCooperativesFilter = {}): CooperativeSummary[] {
  const search = filter.search?.trim().toLowerCase();
  const region = filter.region?.trim().toLowerCase();

  return [...store.cooperatives.values()]
    .filter((cooperative) => {
      refreshExpiredRounds(cooperative);
      if (filter.status && cooperative.status !== filter.status) return false;
      if (region && cooperative.region.toLowerCase() !== region) return false;
      if (filter.memberId && !findMember(cooperative, filter.memberId)) return false;
      if (search) {
        const haystack = `${cooperative.name} ${cooperative.description} ${cooperative.region}`.toLowerCase();
        if (!haystack.includes(search)) return false;
      }
      return true;
    })
    .map(getCooperativeSummary)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function getCooperativeSummary(cooperative: Cooperative): CooperativeSummary {
  const pooled = pooledQuantityTons(cooperative);
  return {
    id: cooperative.id,
    name: cooperative.name,
    description: cooperative.description,
    region: cooperative.region,
    status: cooperative.status,
    founderId: cooperative.founderId,
    memberCount: cooperative.members.length,
    minMembersToBargain: cooperative.minMembersToBargain,
    meetsMemberMinimum: cooperative.members.length >= cooperative.minMembersToBargain,
    pooledProjectCount: cooperative.pooledProjects.length,
    pooledQuantityTons: pooled,
    discountPercent: getDiscountTier(pooled).discountPercent,
    openBargainingRounds: cooperative.bargainingRounds.filter(
      (round) => round.status === 'open' || round.status === 'offer_received'
    ).length,
    createdAt: cooperative.createdAt,
    updatedAt: cooperative.updatedAt,
  };
}

export function addMember(cooperativeId: string, input: AddMemberInput): Cooperative {
  const cooperative = requireCooperative(cooperativeId);

  const userId = (input.userId ?? '').trim();
  if (!userId) throw invalid('userId is required');
  if (findMember(cooperative, userId)) {
    throw conflict(`User ${userId} is already a member of this cooperative`);
  }

  cooperative.members.push({
    userId,
    name: (input.name ?? userId).trim() || userId,
    role: input.role === 'admin' ? 'admin' : 'member',
    walletAddress: input.walletAddress,
    joinedAt: nowIso(),
    contributedTons: 0,
  });

  recomputeStatus(cooperative);
  cooperative.updatedAt = nowIso();
  return clone(cooperative);
}

export function removeMember(cooperativeId: string, memberId: string): Cooperative {
  const cooperative = requireCooperative(cooperativeId);
  const member = findMember(cooperative, memberId);
  if (!member) throw notFound(`Member ${memberId} not found in this cooperative`);
  if (member.role === 'founder') throw conflict('The founder cannot be removed from the cooperative');

  const contributed = cooperative.pooledProjects.filter((item) => item.contributedBy === memberId);
  if (contributed.length > 0) {
    throw conflict('Member has pooled contributions; remove those projects first');
  }

  cooperative.members = cooperative.members.filter((candidate) => candidate.userId !== memberId);
  recomputeStatus(cooperative);
  cooperative.updatedAt = nowIso();
  return clone(cooperative);
}

// ── Project pooling ───────────────────────────────────────────────────────────

function pooledForProject(cooperative: Cooperative, projectId: string): number {
  return cooperative.pooledProjects
    .filter((item) => item.projectId === projectId)
    .reduce((sum, item) => sum + item.quantityTons, 0);
}

export function addPooledProject(
  cooperativeId: string,
  input: AddPooledProjectInput
): PooledProject {
  const cooperative = requireCooperative(cooperativeId);

  const contributorId = (input.contributorId ?? '').trim();
  const contributor = findMember(cooperative, contributorId);
  if (!contributor) throw invalid('Only cooperative members can pool projects');

  const quantityTons = Number(input.quantityTons);
  if (!Number.isFinite(quantityTons) || quantityTons <= 0) {
    throw invalid('quantityTons must be greater than zero');
  }

  const project = mockCarbonProjects.find((candidate) => candidate.id === input.projectId);
  if (!project) throw invalid(`Project ${input.projectId} was not found in the marketplace`);
  if (project.isOutOfStock) throw invalid(`Project ${project.id} is out of stock`);

  const alreadyPooled = pooledForProject(cooperative, project.id);
  const remaining = round4(project.availableSupply - alreadyPooled);
  if (quantityTons > remaining) {
    throw invalid(
      `Only ${remaining} t of ${project.id} remain available to pool (requested ${quantityTons} t)`
    );
  }

  const entry: PooledProject = {
    id: nextId('pool'),
    projectId: project.id,
    projectName: project.name,
    projectType: project.type,
    contributedBy: contributorId,
    quantityTons: round4(quantityTons),
    pricePerTon: project.pricePerTon,
    verificationStatus: project.verificationStatus,
    contributedAt: nowIso(),
  };

  cooperative.pooledProjects.push(entry);
  contributor.contributedTons = round4(contributor.contributedTons + entry.quantityTons);
  cooperative.updatedAt = nowIso();
  return clone(entry);
}

export function removePooledProject(
  cooperativeId: string,
  pooledProjectId: string,
  requesterId?: string
): Cooperative {
  const cooperative = requireCooperative(cooperativeId);
  const entry = cooperative.pooledProjects.find((item) => item.id === pooledProjectId);
  if (!entry) throw notFound(`Pooled project ${pooledProjectId} not found`);

  if (requesterId && entry.contributedBy !== requesterId && !isAdmin(cooperative, requesterId)) {
    throw forbidden('Only the contributor or a cooperative admin can remove this pooled project');
  }

  cooperative.pooledProjects = cooperative.pooledProjects.filter(
    (item) => item.id !== pooledProjectId
  );
  const contributor = findMember(cooperative, entry.contributedBy);
  if (contributor) {
    contributor.contributedTons = round4(
      Math.max(0, contributor.contributedTons - entry.quantityTons)
    );
  }
  cooperative.updatedAt = nowIso();
  return clone(cooperative);
}

// ── Bargaining rounds ─────────────────────────────────────────────────────────

export function createBargainingRound(
  cooperativeId: string,
  input: CreateBargainingRoundInput = {}
): BargainingRound {
  const cooperative = requireCooperative(cooperativeId);
  refreshExpiredRounds(cooperative);

  const terms = buildTerms(cooperative);
  if (!terms.meetsMemberMinimum) {
    throw invalid(
      `A cooperative needs at least ${cooperative.minMembersToBargain} members to start bargaining`
    );
  }
  if (terms.pooledQuantityTons <= 0) {
    throw invalid('Pool at least one project before starting a bargaining round');
  }
  const inFlight = cooperative.bargainingRounds.find(
    (round) => round.status === 'open' || round.status === 'offer_received'
  );
  if (inFlight) throw conflict(`Bargaining round ${inFlight.id} is already in progress`);

  const target =
    input.targetQuantityTons === undefined ? terms.pooledQuantityTons : Number(input.targetQuantityTons);
  if (!Number.isFinite(target) || target <= 0) {
    throw invalid('targetQuantityTons must be greater than zero');
  }

  const deadlineHours = input.deadlineHours ?? DEFAULT_BARGAINING_DEADLINE_HOURS;
  if (!Number.isFinite(deadlineHours) || deadlineHours <= 0) {
    throw invalid('deadlineHours must be greater than zero');
  }

  const timestamp = nowIso();
  const round: BargainingRound = {
    id: nextId('round'),
    cooperativeId,
    targetQuantityTons: round2(target),
    status: 'open',
    offer: null,
    votes: [],
    deadline: new Date(Date.now() + deadlineHours * 60 * 60 * 1_000).toISOString(),
    createdAt: timestamp,
    resolvedAt: null,
  };

  cooperative.bargainingRounds.push(round);
  cooperative.updatedAt = timestamp;
  return clone(round);
}

export function listBargainingRounds(cooperativeId: string): BargainingRound[] {
  const cooperative = requireCooperative(cooperativeId);
  refreshExpiredRounds(cooperative);
  return clone(cooperative.bargainingRounds);
}

export function submitBuyerOffer(
  cooperativeId: string,
  roundId: string,
  input: SubmitBuyerOfferInput
): BargainingRound {
  const cooperative = requireCooperative(cooperativeId);
  refreshExpiredRounds(cooperative);
  const round = requireRound(cooperative, roundId);

  if (round.status === 'expired') throw conflict('This bargaining round has expired');
  if (round.status === 'accepted' || round.status === 'rejected') {
    throw conflict('This bargaining round has already been resolved');
  }

  const buyerId = (input.buyerId ?? '').trim();
  if (!buyerId) throw invalid('buyerId is required');

  const pricePerTon = Number(input.pricePerTon);
  if (!Number.isFinite(pricePerTon) || pricePerTon <= 0) {
    throw invalid('pricePerTon must be greater than zero');
  }

  const quantityTons = Number(input.quantityTons);
  if (!Number.isFinite(quantityTons) || quantityTons <= 0) {
    throw invalid('quantityTons must be greater than zero');
  }

  round.offer = {
    buyerId,
    buyerName: (input.buyerName ?? buyerId).trim() || buyerId,
    pricePerTon: round2(pricePerTon),
    quantityTons: round4(quantityTons),
    terms: input.terms?.trim() || undefined,
    submittedAt: nowIso(),
  };
  round.status = 'offer_received';
  // A revised offer invalidates any votes cast against the previous one.
  round.votes = [];
  cooperative.updatedAt = round.offer.submittedAt;
  return clone(round);
}

function resolveRound(cooperative: Cooperative, round: BargainingRound): void {
  const accepts = round.votes.filter((vote) => vote.vote === 'accept').length;
  const rejects = round.votes.filter((vote) => vote.vote === 'reject').length;
  round.status = accepts > rejects ? 'accepted' : 'rejected';
  round.resolvedAt = nowIso();
  cooperative.updatedAt = round.resolvedAt;
}

/**
 * Auto-resolves once every member has voted; a quorum short of full
 * participation can be closed early with `finalizeBargainingRound`.
 */
function resolveRoundIfComplete(cooperative: Cooperative, round: BargainingRound): void {
  if (round.status !== 'open' && round.status !== 'offer_received') return;
  if (round.votes.length < cooperative.members.length) return;
  resolveRound(cooperative, round);
}

export function voteOnOffer(
  cooperativeId: string,
  roundId: string,
  input: VoteOnOfferInput
): BargainingRound {
  const cooperative = requireCooperative(cooperativeId);
  refreshExpiredRounds(cooperative);
  const round = requireRound(cooperative, roundId);

  if (round.status === 'expired') throw conflict('This bargaining round has expired');
  if (round.status === 'accepted' || round.status === 'rejected') {
    throw conflict('This bargaining round has already been resolved');
  }
  if (!round.offer) throw conflict('There is no buyer offer to vote on yet');

  const memberId = (input.memberId ?? '').trim();
  if (!findMember(cooperative, memberId)) {
    throw invalid('Only cooperative members can vote on a buyer offer');
  }
  if (input.vote !== 'accept' && input.vote !== 'reject') {
    throw invalid("vote must be either 'accept' or 'reject'");
  }
  if (round.votes.some((vote) => vote.memberId === memberId)) {
    throw conflict('Member has already voted on this offer');
  }

  round.votes.push({ memberId, vote: input.vote, votedAt: nowIso() });
  resolveRoundIfComplete(cooperative, round);
  cooperative.updatedAt = nowIso();
  return clone(round);
}

export function finalizeBargainingRound(cooperativeId: string, roundId: string): BargainingRound {
  const cooperative = requireCooperative(cooperativeId);
  refreshExpiredRounds(cooperative);
  const round = requireRound(cooperative, roundId);

  if (round.status === 'expired') throw conflict('This bargaining round has expired');
  if (round.status === 'accepted' || round.status === 'rejected') return clone(round);
  if (!round.offer) throw conflict('There is no buyer offer to decide on yet');

  const required = getQuorumRequired(cooperative);
  if (round.votes.length < required) {
    throw conflict(`Quorum not reached: ${round.votes.length}/${required} member votes cast`);
  }

  resolveRound(cooperative, round);
  cooperative.updatedAt = nowIso();
  return clone(round);
}

/**
 * Marks a cooperative as active/forming after membership changes. Exposed so
 * integrations that mutate membership through another store stay consistent.
 */
export function recomputeCooperativeStatus(cooperativeId: string): CooperativeStatus {
  const cooperative = requireCooperative(cooperativeId);
  recomputeStatus(cooperative);
  cooperative.updatedAt = nowIso();
  return cooperative.status;
}
