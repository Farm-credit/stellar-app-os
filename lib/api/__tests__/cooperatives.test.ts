/**
 * Unit tests for the farmer cooperative service — Issue #1431
 *
 * Covers cooperative formation, membership rules, project pooling, the
 * collective bargaining discount curve, and bargaining-round voting/quorum.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  COOPERATIVE_DISCOUNT_TIERS,
  CooperativeError,
  addMember,
  addPooledProject,
  computeCollectiveBargainingTerms,
  createBargainingRound,
  createCooperative,
  finalizeBargainingRound,
  getCooperative,
  getDiscountTier,
  getNextDiscountTier,
  getQuorumRequired,
  listBargainingRounds,
  listCooperatives,
  removeMember,
  removePooledProject,
  resetCooperativeStore,
  submitBuyerOffer,
  voteOnOffer,
} from '@/lib/api/cooperatives';

// Marketplace fixtures (see lib/api/mock/carbonProjects.ts)
const PROJ_REFOREST = 'proj-001'; // $45.50 / t, 1250.75 t available
const PROJ_WIND = 'proj-002'; // $38.25 / t, 850.30 t available
const PROJ_MANGROVE = 'proj-004'; // $55.75 / t, 2100.50 t available
const PROJ_KENYA = 'proj-005'; // $35.00 / t, 450.20 t available
const PROJ_OUT_OF_STOCK = 'proj-003'; // 0 t available

function makeCoop(overrides: Partial<Parameters<typeof createCooperative>[0]> = {}) {
  return createCooperative({
    name: 'Nairobi Grain Alliance',
    region: 'Kenya',
    founderId: 'farmer-founder',
    founderName: 'Amina',
    minMembersToBargain: 3,
    bargainingQuorumPercent: 60,
    ...overrides,
  });
}

function makeThreeMemberCoop() {
  const coop = makeCoop();
  addMember(coop.id, { userId: 'farmer-2', name: 'Bola' });
  addMember(coop.id, { userId: 'farmer-3', name: 'Chidi' });
  return getCooperative(coop.id);
}

beforeEach(() => {
  resetCooperativeStore();
});

afterEach(() => {
  vi.useRealTimers();
});

// ── Formation ─────────────────────────────────────────────────────────────────

describe('createCooperative', () => {
  it('creates a cooperative with the founder as the first member', () => {
    const coop = makeCoop();

    expect(coop.id).toMatch(/^coop-/);
    expect(coop.name).toBe('Nairobi Grain Alliance');
    expect(coop.region).toBe('Kenya');
    expect(coop.founderId).toBe('farmer-founder');
    expect(coop.members).toHaveLength(1);
    expect(coop.members[0]).toMatchObject({
      userId: 'farmer-founder',
      name: 'Amina',
      role: 'founder',
      contributedTons: 0,
    });
    expect(coop.pooledProjects).toEqual([]);
    expect(coop.bargainingRounds).toEqual([]);
  });

  it('trims whitespace and defaults an unspecified region', () => {
    const coop = createCooperative({
      name: '  Coastal Growers  ',
      region: '   ',
      founderId: '  farmer-1  ',
    });

    expect(coop.name).toBe('Coastal Growers');
    expect(coop.region).toBe('Unspecified');
    expect(coop.founderId).toBe('farmer-1');
  });

  it('rejects names shorter than 3 characters', () => {
    expect(() => createCooperative({ name: 'ab', founderId: 'f1' })).toThrow(CooperativeError);
    expect(() => createCooperative({ name: '   ', founderId: 'f1' })).toThrow(
      /at least 3 characters/
    );
  });

  it('rejects a missing founder', () => {
    expect(() => createCooperative({ name: 'Valid Name', founderId: '' })).toThrow(
      /founderId is required/
    );
  });

  it('rejects invalid member/quorum settings', () => {
    expect(() => makeCoop({ minMembersToBargain: 1 })).toThrow(/at least 2/);
    expect(() => makeCoop({ minMembersToBargain: 2.5 })).toThrow(/integer/);
    expect(() => makeCoop({ bargainingQuorumPercent: 0 })).toThrow(/between 1 and 100/);
    expect(() => makeCoop({ bargainingQuorumPercent: 101 })).toThrow(/between 1 and 100/);
  });

  it('moves from forming to active once the member minimum is met', () => {
    const coop = makeCoop();
    expect(coop.status).toBe('forming');

    addMember(coop.id, { userId: 'farmer-2' });
    expect(getCooperative(coop.id).status).toBe('forming');

    addMember(coop.id, { userId: 'farmer-3' });
    expect(getCooperative(coop.id).status).toBe('active');
  });
});

// ── Listing ───────────────────────────────────────────────────────────────────

describe('listCooperatives', () => {
  it('filters by region, search, status and membership', () => {
    const kenya = makeCoop({ name: 'Kenya Growers', region: 'Kenya' });
    makeCoop({ name: 'Ghana Cocoa Union', region: 'Ghana', founderId: 'farmer-gh' });

    expect(listCooperatives({ region: 'Kenya' })).toHaveLength(1);
    expect(listCooperatives({ region: 'kenya' })[0].id).toBe(kenya.id);
    expect(listCooperatives({ search: 'cocoa' })).toHaveLength(1);
    expect(listCooperatives({ status: 'forming' })).toHaveLength(2);
    expect(listCooperatives({ memberId: 'farmer-gh' })).toHaveLength(1);
    expect(listCooperatives({ memberId: 'nobody' })).toHaveLength(0);
  });

  it('returns summaries sorted by name with pool metrics', () => {
    makeCoop({ name: 'Zeta Coop' });
    const alpha = makeCoop({ name: 'Alpha Coop', founderId: 'f2' });
    addPooledProject(alpha.id, {
      projectId: PROJ_REFOREST,
      contributorId: 'f2',
      quantityTons: 600,
    });

    const list = listCooperatives();
    expect(list.map((item) => item.name)).toEqual(['Alpha Coop', 'Zeta Coop']);
    expect(list[0]).toMatchObject({
      memberCount: 1,
      pooledProjectCount: 1,
      pooledQuantityTons: 600,
      discountPercent: 3,
      meetsMemberMinimum: false,
    });
  });
});

// ── Membership ────────────────────────────────────────────────────────────────

describe('membership', () => {
  it('adds members and defaults them to the member role', () => {
    const coop = makeCoop();
    const updated = addMember(coop.id, { userId: 'farmer-2', name: 'Bola' });

    expect(updated.members).toHaveLength(2);
    expect(updated.members[1]).toMatchObject({ userId: 'farmer-2', role: 'member' });
  });

  it('supports promoting a member to admin', () => {
    const coop = makeCoop();
    const updated = addMember(coop.id, { userId: 'farmer-2', role: 'admin' });
    expect(updated.members[1].role).toBe('admin');
  });

  it('rejects duplicate members', () => {
    const coop = makeCoop();
    expect(() => addMember(coop.id, { userId: 'farmer-founder' })).toThrow(/already a member/);
  });

  it('throws 404 for an unknown cooperative', () => {
    try {
      addMember('coop-missing', { userId: 'x' });
      throw new Error('expected to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(CooperativeError);
      expect((error as CooperativeError).status).toBe(404);
    }
  });

  it('removes a plain member', () => {
    const coop = makeThreeMemberCoop();
    const updated = removeMember(coop.id, 'farmer-2');
    expect(updated.members.map((m) => m.userId)).toEqual(['farmer-founder', 'farmer-3']);
  });

  it('refuses to remove the founder', () => {
    const coop = makeCoop();
    expect(() => removeMember(coop.id, 'farmer-founder')).toThrow(/founder cannot be removed/);
  });

  it('refuses to remove a member with pooled contributions', () => {
    const coop = makeThreeMemberCoop();
    addPooledProject(coop.id, {
      projectId: PROJ_REFOREST,
      contributorId: 'farmer-2',
      quantityTons: 10,
    });
    expect(() => removeMember(coop.id, 'farmer-2')).toThrow(/remove those projects first/);
  });

  it('throws 404 for an unknown member', () => {
    const coop = makeCoop();
    expect(() => removeMember(coop.id, 'ghost')).toThrow(/Member ghost not found/);
  });
});

// ── Project pooling ───────────────────────────────────────────────────────────

describe('pooled projects', () => {
  it('pools a project and records the contributor tonnage', () => {
    const coop = makeThreeMemberCoop();
    const pooled = addPooledProject(coop.id, {
      projectId: PROJ_REFOREST,
      contributorId: 'farmer-2',
      quantityTons: 250,
    });

    expect(pooled).toMatchObject({
      projectId: PROJ_REFOREST,
      projectName: 'Amazon Rainforest Reforestation',
      pricePerTon: 45.5,
      quantityTons: 250,
      contributedBy: 'farmer-2',
    });

    const reloaded = getCooperative(coop.id);
    expect(reloaded.pooledProjects).toHaveLength(1);
    expect(reloaded.members.find((m) => m.userId === 'farmer-2')?.contributedTons).toBe(250);
  });

  it('rejects unknown projects', () => {
    const coop = makeThreeMemberCoop();
    expect(() =>
      addPooledProject(coop.id, { projectId: 'nope', contributorId: 'farmer-2', quantityTons: 5 })
    ).toThrow(/was not found in the marketplace/);
  });

  it('rejects out-of-stock projects', () => {
    const coop = makeThreeMemberCoop();
    expect(() =>
      addPooledProject(coop.id, {
        projectId: PROJ_OUT_OF_STOCK,
        contributorId: 'farmer-2',
        quantityTons: 5,
      })
    ).toThrow(/out of stock/);
  });

  it('only lets members contribute', () => {
    const coop = makeThreeMemberCoop();
    expect(() =>
      addPooledProject(coop.id, {
        projectId: PROJ_REFOREST,
        contributorId: 'outsider',
        quantityTons: 5,
      })
    ).toThrow(/Only cooperative members/);
  });

  it('rejects non-positive quantities', () => {
    const coop = makeThreeMemberCoop();
    for (const quantityTons of [0, -5, Number.NaN]) {
      expect(() =>
        addPooledProject(coop.id, {
          projectId: PROJ_REFOREST,
          contributorId: 'farmer-2',
          quantityTons,
        })
      ).toThrow(/greater than zero/);
    }
  });

  it('caps contributions at the marketplace supply across members', () => {
    const coop = makeThreeMemberCoop();
    addPooledProject(coop.id, {
      projectId: PROJ_KENYA,
      contributorId: 'farmer-2',
      quantityTons: 400,
    });

    // proj-005 only has 450.2 t available → 60 t more is fine, 61 is not.
    expect(() =>
      addPooledProject(coop.id, {
        projectId: PROJ_KENYA,
        contributorId: 'farmer-3',
        quantityTons: 61,
      })
    ).toThrow(/remain available to pool/);

    const pooled = addPooledProject(coop.id, {
      projectId: PROJ_KENYA,
      contributorId: 'farmer-3',
      quantityTons: 50.2,
    });
    expect(pooled.quantityTons).toBe(50.2);
  });

  it('restores contributor tonnage when a pooled project is withdrawn', () => {
    const coop = makeThreeMemberCoop();
    const pooled = addPooledProject(coop.id, {
      projectId: PROJ_REFOREST,
      contributorId: 'farmer-2',
      quantityTons: 100,
    });

    const updated = removePooledProject(coop.id, pooled.id, 'farmer-2');
    expect(updated.pooledProjects).toHaveLength(0);
    expect(updated.members.find((m) => m.userId === 'farmer-2')?.contributedTons).toBe(0);
  });

  it('lets the contributor, admins and the founder withdraw a contribution', () => {
    const coop = makeThreeMemberCoop();
    addMember(coop.id, { userId: 'farmer-4', role: 'admin' });
    const pooled = addPooledProject(coop.id, {
      projectId: PROJ_REFOREST,
      contributorId: 'farmer-2',
      quantityTons: 10,
    });

    expect(() => removePooledProject(coop.id, pooled.id, 'farmer-3')).toThrow(
      /Only the contributor or a cooperative admin/
    );
    expect(() => removePooledProject(coop.id, pooled.id, 'farmer-4')).not.toThrow();
  });

  it('throws 404 for an unknown pooled project', () => {
    const coop = makeThreeMemberCoop();
    expect(() => removePooledProject(coop.id, 'pool-nope')).toThrow(/not found/);
  });
});

// ── Discount curve + terms ────────────────────────────────────────────────────

describe('discount tiers', () => {
  it('exposes an ascending curve starting at 0', () => {
    const mins = COOPERATIVE_DISCOUNT_TIERS.map((tier) => tier.minTons);
    expect(mins).toEqual([...mins].sort((a, b) => a - b));
    expect(COOPERATIVE_DISCOUNT_TIERS[0]).toEqual({ minTons: 0, discountPercent: 0 });
  });

  it('selects the highest unlocked tier, inclusive at the boundary', () => {
    expect(getDiscountTier(0).discountPercent).toBe(0);
    expect(getDiscountTier(499.99).minTons).toBe(0);
    expect(getDiscountTier(500).discountPercent).toBe(3);
    expect(getDiscountTier(1_000).discountPercent).toBe(6);
    expect(getDiscountTier(2_500).discountPercent).toBe(10);
    expect(getDiscountTier(9_999).discountPercent).toBe(15);
    expect(getDiscountTier(10_000).discountPercent).toBe(20);
  });

  it('reports the next tier above the current quantity', () => {
    expect(getNextDiscountTier(0)?.minTons).toBe(500);
    expect(getNextDiscountTier(500)?.minTons).toBe(1_000);
    expect(getNextDiscountTier(10_000)).toBeNull();
  });
});

describe('computeCollectiveBargainingTerms', () => {
  it('returns an empty position when nothing is pooled', () => {
    const coop = makeCoop();
    const terms = computeCollectiveBargainingTerms(coop.id);

    expect(terms).toMatchObject({
      pooledQuantityTons: 0,
      tier: null,
      discountPercent: 0,
      blendedPricePerTon: 0,
      effectivePricePerTon: 0,
      estimatedTotal: 0,
      estimatedSavings: 0,
      meetsMemberMinimum: false,
      missingTonsForNextTier: 500, // 500 t needed to unlock the first discount tier
    });
  });

  it('computes the weighted blended price and 6 % discount at exactly 1 000 t', () => {
    const coop = makeThreeMemberCoop();
    addPooledProject(coop.id, {
      projectId: PROJ_REFOREST,
      contributorId: 'farmer-founder',
      quantityTons: 600,
    });
    addPooledProject(coop.id, {
      projectId: PROJ_KENYA,
      contributorId: 'farmer-2',
      quantityTons: 400,
    });

    const terms = computeCollectiveBargainingTerms(coop.id);
    expect(terms.pooledQuantityTons).toBe(1_000);
    expect(terms.meetsMemberMinimum).toBe(true);
    expect(terms.discountPercent).toBe(6);
    expect(terms.blendedPricePerTon).toBe(41.3);
    expect(terms.effectivePricePerTon).toBe(38.82);
    expect(terms.estimatedTotal).toBe(38_820);
    expect(terms.estimatedSavings).toBe(2_480);
    expect(terms.missingTonsForNextTier).toBe(1_500);
  });

  it('reports the 3 % tier at exactly 500 t', () => {
    const coop = makeThreeMemberCoop();
    addPooledProject(coop.id, {
      projectId: PROJ_REFOREST,
      contributorId: 'farmer-founder',
      quantityTons: 500,
    });

    const terms = computeCollectiveBargainingTerms(coop.id);
    expect(terms.discountPercent).toBe(3);
    expect(terms.effectivePricePerTon).toBe(44.14);
    expect(terms.estimatedSavings).toBe(680);
    expect(terms.missingTonsForNextTier).toBe(500);
  });

  it('evaluates what-if target quantities without changing the pool', () => {
    const coop = makeThreeMemberCoop();
    addPooledProject(coop.id, {
      projectId: PROJ_REFOREST,
      contributorId: 'farmer-founder',
      quantityTons: 500,
    });

    const terms = computeCollectiveBargainingTerms(coop.id, 2_500);
    expect(terms.pooledQuantityTons).toBe(500); // real pool unchanged
    expect(terms.discountPercent).toBe(10); // target tier applied
    expect(terms.effectivePricePerTon).toBe(40.95);
    expect(terms.estimatedTotal).toBe(20_475);
    expect(terms.estimatedSavings).toBe(2_275);
    expect(terms.missingTonsForNextTier).toBe(2_500);
  });

  it('has no next tier at the top of the curve', () => {
    const coop = makeThreeMemberCoop();
    addPooledProject(coop.id, {
      projectId: PROJ_REFOREST,
      contributorId: 'farmer-founder',
      quantityTons: 500,
    });

    const terms = computeCollectiveBargainingTerms(coop.id, 10_000);
    expect(terms.discountPercent).toBe(20);
    expect(terms.missingTonsForNextTier).toBeNull();
  });

  it('flips meetsMemberMinimum at the configured threshold', () => {
    const coop = makeCoop({ minMembersToBargain: 2 });
    expect(computeCollectiveBargainingTerms(coop.id).meetsMemberMinimum).toBe(false);
    addMember(coop.id, { userId: 'farmer-2' });
    expect(computeCollectiveBargainingTerms(coop.id).meetsMemberMinimum).toBe(true);
  });
});

// ── Bargaining rounds ─────────────────────────────────────────────────────────

describe('bargaining rounds', () => {
  function readyCoop() {
    const coop = makeThreeMemberCoop();
    addPooledProject(coop.id, {
      projectId: PROJ_REFOREST,
      contributorId: 'farmer-founder',
      quantityTons: 400,
    });
    addPooledProject(coop.id, {
      projectId: PROJ_MANGROVE,
      contributorId: 'farmer-2',
      quantityTons: 600,
    });
    return coop.id;
  }

  it('refuses to start before the member minimum is met', () => {
    const coop = makeCoop();
    addPooledProject(coop.id, {
      projectId: PROJ_REFOREST,
      contributorId: 'farmer-founder',
      quantityTons: 100,
    });
    expect(() => createBargainingRound(coop.id)).toThrow(/at least 3 members/);
  });

  it('refuses to start with an empty pool', () => {
    const coop = makeThreeMemberCoop();
    expect(() => createBargainingRound(coop.id)).toThrow(/Pool at least one project/);
  });

  it('opens a round defaulting to the pooled quantity and a 72 h deadline', () => {
    const id = readyCoop();
    const round = createBargainingRound(id);

    expect(round.status).toBe('open');
    expect(round.targetQuantityTons).toBe(1_000);
    expect(round.offer).toBeNull();
    expect(round.votes).toEqual([]);
    expect(Date.parse(round.deadline)).toBeGreaterThan(Date.now());
  });

  it('refuses a second in-flight round', () => {
    const id = readyCoop();
    createBargainingRound(id);
    expect(() => createBargainingRound(id)).toThrow(/already in progress/);
  });

  it('validates round targets and deadlines', () => {
    const id = readyCoop();
    expect(() => createBargainingRound(id, { targetQuantityTons: 0 })).toThrow(
      /targetQuantityTons must be greater than zero/
    );
    expect(() => createBargainingRound(id, { deadlineHours: -1 })).toThrow(
      /deadlineHours must be greater than zero/
    );
  });

  it('records a buyer offer and moves the round to offer_received', () => {
    const id = readyCoop();
    const round = createBargainingRound(id);

    const updated = submitBuyerOffer(id, round.id, {
      buyerId: 'buyer-1',
      buyerName: 'EcoCorp',
      pricePerTon: 42,
      quantityTons: 1_000,
      terms: 'Net 30, verified delivery',
    });

    expect(updated.status).toBe('offer_received');
    expect(updated.offer).toMatchObject({
      buyerId: 'buyer-1',
      buyerName: 'EcoCorp',
      pricePerTon: 42,
      quantityTons: 1_000,
      terms: 'Net 30, verified delivery',
    });
  });

  it('rejects offers with non-positive price or quantity', () => {
    const id = readyCoop();
    const round = createBargainingRound(id);
    expect(() =>
      submitBuyerOffer(id, round.id, { buyerId: 'b', pricePerTon: 0, quantityTons: 10 })
    ).toThrow(/pricePerTon must be greater than zero/);
    expect(() =>
      submitBuyerOffer(id, round.id, { buyerId: 'b', pricePerTon: 10, quantityTons: 0 })
    ).toThrow(/quantityTons must be greater than zero/);
  });

  it('invalidates earlier votes when a revised buyer offer arrives', () => {
    const id = readyCoop();
    const round = createBargainingRound(id);
    submitBuyerOffer(id, round.id, { buyerId: 'b1', pricePerTon: 40, quantityTons: 1_000 });
    voteOnOffer(id, round.id, { memberId: 'farmer-2', vote: 'accept' });

    const revised = submitBuyerOffer(id, round.id, {
      buyerId: 'b2',
      pricePerTon: 44,
      quantityTons: 1_000,
    });
    expect(revised.offer?.buyerId).toBe('b2');
    expect(revised.votes).toEqual([]);
  });

  it('requires an offer before members can vote', () => {
    const id = readyCoop();
    const round = createBargainingRound(id);
    expect(() => voteOnOffer(id, round.id, { memberId: 'farmer-2', vote: 'accept' })).toThrow(
      /no buyer offer to vote on/
    );
  });

  it('records member votes and auto-resolves once every member has voted', () => {
    const id = readyCoop();
    const round = createBargainingRound(id);
    submitBuyerOffer(id, round.id, { buyerId: 'b', pricePerTon: 40, quantityTons: 1_000 });

    const coop = getCooperative(id);
    expect(getQuorumRequired(coop)).toBe(2); // ceil(3 * 60 / 100)

    const afterFirst = voteOnOffer(id, round.id, { memberId: 'farmer-founder', vote: 'accept' });
    expect(afterFirst.status).toBe('offer_received');
    expect(afterFirst.votes).toHaveLength(1);

    const afterSecond = voteOnOffer(id, round.id, { memberId: 'farmer-2', vote: 'accept' });
    expect(afterSecond.status).toBe('offer_received'); // quorum reached, but not everyone voted

    const afterThird = voteOnOffer(id, round.id, { memberId: 'farmer-3', vote: 'reject' });
    expect(afterThird.status).toBe('accepted');
    expect(afterThird.resolvedAt).not.toBeNull();
  });

  it('rejects an offer when quorum of members votes against it', () => {
    const coop = makeCoop({ bargainingQuorumPercent: 100 });
    addMember(coop.id, { userId: 'farmer-2' });
    addMember(coop.id, { userId: 'farmer-3' });
    addPooledProject(coop.id, {
      projectId: PROJ_REFOREST,
      contributorId: 'farmer-founder',
      quantityTons: 300,
    });

    const round = createBargainingRound(coop.id);
    submitBuyerOffer(coop.id, round.id, { buyerId: 'b', pricePerTon: 30, quantityTons: 300 });

    expect(voteOnOffer(coop.id, round.id, { memberId: 'farmer-founder', vote: 'accept' }).status).toBe(
      'offer_received'
    );
    voteOnOffer(coop.id, round.id, { memberId: 'farmer-2', vote: 'reject' });
    const resolved = voteOnOffer(coop.id, round.id, { memberId: 'farmer-3', vote: 'reject' });
    expect(resolved.status).toBe('rejected');
  });

  it('rejects duplicate votes, non-member votes and votes on resolved rounds', () => {
    const id = readyCoop();
    const round = createBargainingRound(id);
    submitBuyerOffer(id, round.id, { buyerId: 'b', pricePerTon: 40, quantityTons: 1_000 });
    voteOnOffer(id, round.id, { memberId: 'farmer-2', vote: 'accept' });

    expect(() => voteOnOffer(id, round.id, { memberId: 'farmer-2', vote: 'reject' })).toThrow(
      /already voted/
    );
    expect(() => voteOnOffer(id, round.id, { memberId: 'outsider', vote: 'accept' })).toThrow(
      /Only cooperative members can vote/
    );
    expect(() => voteOnOffer(id, round.id, { memberId: 'farmer-2', vote: 'maybe' as never })).toThrow(
      /must be either/
    );

    voteOnOffer(id, round.id, { memberId: 'farmer-founder', vote: 'accept' });
    voteOnOffer(id, round.id, { memberId: 'farmer-3', vote: 'reject' }); // everyone voted → resolved

    expect(() => voteOnOffer(id, round.id, { memberId: 'farmer-3', vote: 'reject' })).toThrow(
      /already been resolved/
    );
  });

  it('requires quorum to finalize', () => {
    const id = readyCoop();
    const round = createBargainingRound(id);
    submitBuyerOffer(id, round.id, { buyerId: 'b', pricePerTon: 40, quantityTons: 1_000 });
    voteOnOffer(id, round.id, { memberId: 'farmer-2', vote: 'accept' });

    expect(() => finalizeBargainingRound(id, round.id)).toThrow(/Quorum not reached: 1\/2/);
  });

  it('finalizes a round early once quorum is cast', () => {
    const id = readyCoop();
    const round = createBargainingRound(id);
    submitBuyerOffer(id, round.id, { buyerId: 'b', pricePerTon: 40, quantityTons: 1_000 });

    expect(() => finalizeBargainingRound(id, round.id)).toThrow(/Quorum not reached: 0\/2/);

    voteOnOffer(id, round.id, { memberId: 'farmer-2', vote: 'accept' });
    expect(() => finalizeBargainingRound(id, round.id)).toThrow(/Quorum not reached: 1\/2/);

    voteOnOffer(id, round.id, { memberId: 'farmer-founder', vote: 'accept' });
    const finalized = finalizeBargainingRound(id, round.id);
    expect(finalized.status).toBe('accepted');
    expect(finalized.votes).toHaveLength(2);
  });

  it('expires in-flight rounds whose deadline has passed', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-26T00:00:00Z'));

    const id = readyCoop();
    const round = createBargainingRound(id, { deadlineHours: 1 });
    expect(round.status).toBe('open');

    vi.setSystemTime(new Date('2026-09-26T02:00:00Z'));
    const rounds = listBargainingRounds(id);
    expect(rounds[0].status).toBe('expired');
    expect(rounds[0].resolvedAt).not.toBeNull();

    expect(() =>
      submitBuyerOffer(id, round.id, { buyerId: 'b', pricePerTon: 40, quantityTons: 1_000 })
    ).toThrow(/expired/);
  });
});
