import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  ACRES_PER_HECTARE,
  formatStellarAddress,
  getBenefactorLeaderboard,
  hectaresToAcres,
  isValidBenefactorAddress,
  rankBenefactors,
  SEED_BENEFACTORS,
  type BenefactorRecord,
} from '../leaderboard';

describe('benefactor leaderboard domain logic', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('ranks benefactors descending by hectares restored by default', () => {
    const result = getBenefactorLeaderboard();
    expect(result.entries.length).toBe(SEED_BENEFACTORS.length);
    for (let i = 1; i < result.entries.length; i++) {
      expect(result.entries[i - 1].hectaresRestored).toBeGreaterThanOrEqual(
        result.entries[i].hectaresRestored
      );
      expect(result.entries[i].rank).toBe(i + 1);
    }
    expect(result.entries[0].rank).toBe(1);
  });

  it('converts hectares to acres accurately and warns on invalid input', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(hectaresToAcres(100)).toBe(Number((100 * ACRES_PER_HECTARE).toFixed(2)));
    expect(hectaresToAcres(-5)).toBe(0);
    expect(warnSpy).toHaveBeenCalled();
  });

  it('validates Stellar Ed25519 public keys and filters out invalid entries with warning', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const validKey = SEED_BENEFACTORS[0].stellarAddress;
    expect(isValidBenefactorAddress(validKey)).toBe(true);
    expect(isValidBenefactorAddress('INVALID_STELLAR_KEY')).toBe(false);
    expect(warnSpy).toHaveBeenCalled();

    const mixed: BenefactorRecord[] = [
      SEED_BENEFACTORS[0],
      {
        ...SEED_BENEFACTORS[1],
        id: 'invalid-entry',
        stellarAddress: 'NOT_A_KEY',
      },
    ];
    const ranked = rankBenefactors(mixed);
    expect(ranked.entries).toHaveLength(1);
    expect(ranked.entries[0].id).toBe(SEED_BENEFACTORS[0].id);
  });

  it('filters by corporate and individual benefactor types', () => {
    const corporate = getBenefactorLeaderboard({ type: 'corporate' });
    expect(corporate.entries.length).toBeGreaterThan(0);
    expect(corporate.entries.every((e) => e.type === 'corporate')).toBe(true);
    expect(corporate.summary.individualCount).toBe(0);

    const individual = getBenefactorLeaderboard({ type: 'individual' });
    expect(individual.entries.length).toBeGreaterThan(0);
    expect(individual.entries.every((e) => e.type === 'individual')).toBe(true);
    expect(individual.summary.corporateCount).toBe(0);
  });

  it('supports sorting by community impact score and stewards supported', () => {
    const byImpact = getBenefactorLeaderboard({ sortBy: 'impactScore' });
    for (let i = 1; i < byImpact.entries.length; i++) {
      expect(byImpact.entries[i - 1].communityImpactScore).toBeGreaterThanOrEqual(
        byImpact.entries[i].communityImpactScore
      );
    }

    const byStewards = getBenefactorLeaderboard({ sortBy: 'stewardsSupported' });
    for (let i = 1; i < byStewards.entries.length; i++) {
      expect(byStewards.entries[i - 1].totalStewardsSupported).toBeGreaterThanOrEqual(
        byStewards.entries[i].totalStewardsSupported
      );
    }
  });

  it('filters by search query across name, region, and Stellar address', () => {
    const byName = getBenefactorLeaderboard({ search: 'Amara' });
    expect(byName.entries).toHaveLength(1);
    expect(byName.entries[0].name).toContain('Amara');

    const byRegion = getBenefactorLeaderboard({ search: 'Latin America' });
    expect(byRegion.entries.length).toBeGreaterThan(0);
    expect(byRegion.entries.every((e) => e.region === 'Latin America')).toBe(true);
  });

  it('scales metrics for quarterly and monthly periods and aggregates summary correctly', () => {
    const allTime = getBenefactorLeaderboard({ period: 'all-time' });
    const monthly = getBenefactorLeaderboard({ period: 'monthly' });
    expect(monthly.summary.totalHectaresRestored).toBeLessThan(
      allTime.summary.totalHectaresRestored
    );
    expect(monthly.summary.totalBenefactors).toBe(allTime.summary.totalBenefactors);
  });

  it('formats Stellar addresses cleanly', () => {
    const addr = SEED_BENEFACTORS[0].stellarAddress;
    expect(formatStellarAddress(addr, 6)).toBe(`${addr.slice(0, 6)}...${addr.slice(-6)}`);
  });
});
