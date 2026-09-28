import { describe, expect, it } from 'vitest';
import {
  classifyCoBenefits,
  parseBuyerProfile,
  recommendProjects,
  SIGNAL_WEIGHTS,
  type BuyerProfile,
} from '@/lib/marketplace/buyerRecommendations';
import { mockCarbonProjects } from '@/lib/api/mock/carbonProjects';
import type { CarbonProject } from '@/lib/types/carbon';

function profile(overrides: Partial<BuyerProfile> = {}): BuyerProfile {
  return { industry: 'other', companySize: 'sme', budgetUsd: 10_000, ...overrides };
}

function ids(result: ReturnType<typeof recommendProjects>): string[] {
  return result.recommendations.map((recommendation) => recommendation.project.id);
}

describe('SIGNAL_WEIGHTS', () => {
  it('sums to 1 so scores stay on a 0–100 scale', () => {
    const total = Object.values(SIGNAL_WEIGHTS).reduce((sum, weight) => sum + weight, 0);
    expect(total).toBeCloseTo(1, 10);
  });
});

describe('classifyCoBenefits', () => {
  it('maps free-text co-benefits onto preference categories', () => {
    const amazon = mockCarbonProjects.find((project) => project.id === 'proj-001')!;
    expect(classifyCoBenefits(amazon)).toEqual(['biodiversity', 'water', 'community']);
  });

  it('infers categories implied by the project type', () => {
    const mangrove = mockCarbonProjects.find((project) => project.id === 'proj-004')!;
    expect(classifyCoBenefits(mangrove)).toContain('coastal_resilience');
  });
});

describe('recommendProjects', () => {
  it('excludes out-of-stock projects and those the budget cannot buy one tonne of', () => {
    const result = recommendProjects(profile({ budgetUsd: 40 }), mockCarbonProjects);
    expect(ids(result)).toEqual(['proj-005', 'proj-002']);
    expect(result.excluded).toEqual([
      { projectId: 'proj-001', reason: 'over_budget' },
      { projectId: 'proj-003', reason: 'out_of_stock' },
      { projectId: 'proj-004', reason: 'over_budget' },
    ]);
  });

  it('puts value-chain projects first for an agriculture & food buyer', () => {
    const result = recommendProjects(
      profile({ industry: 'agriculture_food', coBenefitPreferences: ['soil', 'food_security'] }),
      mockCarbonProjects
    );
    expect(result.recommendations[0].project.id).toBe('proj-005');
    expect(result.recommendations[0].breakdown.coBenefits).toBe(1);
    expect(result.recommendations[0].reasons[0]).toMatch(/strong fit|co-benefits/);
  });

  it('puts renewable energy first for a technology buyer who wants clean energy', () => {
    const result = recommendProjects(
      profile({ industry: 'technology', coBenefitPreferences: ['clean_energy'] }),
      mockCarbonProjects
    );
    expect(result.recommendations[0].project.id).toBe('proj-002');
  });

  it('follows co-benefit preferences', () => {
    const result = recommendProjects(
      profile({ coBenefitPreferences: ['coastal_resilience', 'biodiversity'] }),
      mockCarbonProjects
    );
    expect(result.recommendations[0].project.id).toBe('proj-004');
    expect(result.recommendations[0].matchedCoBenefits).toEqual(
      expect.arrayContaining(['coastal_resilience', 'biodiversity'])
    );
  });

  it('favours supply depth for enterprises and low prices for startups', () => {
    const enterprise = recommendProjects(
      profile({ companySize: 'enterprise', budgetUsd: 100_000 }),
      mockCarbonProjects
    );
    const startup = recommendProjects(
      profile({ companySize: 'startup', budgetUsd: 100_000 }),
      mockCarbonProjects
    );
    const sizeOf = (result: typeof enterprise, id: string) =>
      result.recommendations.find((recommendation) => recommendation.project.id === id)!.breakdown
        .size;

    // proj-004 has 2,100t available but is the priciest; proj-005 is cheapest with 450t.
    expect(sizeOf(enterprise, 'proj-004')).toBe(1);
    expect(sizeOf(enterprise, 'proj-005')).toBeLessThan(0.5);
    expect(sizeOf(startup, 'proj-005')).toBe(1);
    expect(sizeOf(startup, 'proj-004')).toBe(0);
  });

  it('learns from past purchases but nudges towards diversification', () => {
    const withHistory = recommendProjects(
      profile({ pastPurchases: [{ projectId: 'proj-001', tonnes: 50 }] }),
      mockCarbonProjects
    );
    const history = Object.fromEntries(
      withHistory.recommendations.map((recommendation) => [
        recommendation.project.id,
        recommendation.breakdown.history,
      ])
    );
    expect(history['proj-001']).toBeCloseTo(0.85, 5); // same type, but already owned
    expect(history['proj-002']).toBeCloseTo(0.3, 5); // different type

    const noHistory = recommendProjects(profile(), mockCarbonProjects);
    expect(
      noHistory.recommendations.every((recommendation) => recommendation.breakdown.history === 0.5)
    ).toBe(true);
  });

  it('suggests whole tonnes within budget and supply, with a cost estimate', () => {
    const result = recommendProjects(profile({ budgetUsd: 1_000 }), mockCarbonProjects);
    const kenya = result.recommendations.find(
      (recommendation) => recommendation.project.id === 'proj-005'
    )!;
    expect(kenya.suggestedTonnes).toBe(28); // floor(1000 / 35)
    expect(kenya.estimatedCostUsd).toBe(980);

    const big = recommendProjects(profile({ budgetUsd: 1_000_000 }), mockCarbonProjects);
    const kenyaBig = big.recommendations.find(
      (recommendation) => recommendation.project.id === 'proj-005'
    )!;
    expect(kenyaBig.suggestedTonnes).toBe(450); // capped by supply
  });

  it('is deterministic and breaks ties by price then id', () => {
    const twin = (id: string, pricePerTon: number): CarbonProject => ({
      ...mockCarbonProjects[0],
      id,
      pricePerTon,
    });
    const result = recommendProjects(profile({ companySize: 'enterprise', budgetUsd: 1e9 }), [
      twin('b', 40),
      twin('a', 40),
      twin('c', 30),
    ]);
    expect(ids(result)).toEqual(['c', 'a', 'b']);
  });

  it('respects the limit and keeps scores within 0–100', () => {
    const result = recommendProjects(profile(), mockCarbonProjects, 2);
    expect(result.recommendations).toHaveLength(2);
    for (const recommendation of result.recommendations) {
      expect(recommendation.score).toBeGreaterThanOrEqual(0);
      expect(recommendation.score).toBeLessThanOrEqual(100);
    }
  });
});

describe('parseBuyerProfile', () => {
  it('accepts a valid profile and de-duplicates preferences', () => {
    const parsed = parseBuyerProfile({
      industry: 'finance',
      companySize: 'enterprise',
      budgetUsd: '2500',
      coBenefitPreferences: ['water', 'water'],
      pastPurchases: [{ projectId: 'proj-002', tonnes: '12' }],
    });
    expect(parsed).toEqual({
      ok: true,
      profile: {
        industry: 'finance',
        companySize: 'enterprise',
        budgetUsd: 2500,
        coBenefitPreferences: ['water'],
        pastPurchases: [{ projectId: 'proj-002', tonnes: 12 }],
      },
    });
  });

  it('reports every invalid field', () => {
    const parsed = parseBuyerProfile({
      industry: 'mining',
      companySize: 'mega',
      budgetUsd: 0,
      coBenefitPreferences: ['vibes'],
      pastPurchases: [{ projectId: 1, tonnes: -5 }],
    });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.errors).toHaveLength(5);
  });

  it('rejects non-object input', () => {
    expect(parseBuyerProfile(null).ok).toBe(false);
  });
});
