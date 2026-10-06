import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CHALLENGE,
  createTeamChallengeStore,
  getTeamChallengeStore,
  SEED_TEAMS,
} from '@/lib/team-challenges/teamChallengeStore';

describe('createTeamChallengeStore', () => {
  it('seeds teams with unique ids and at least one ineligible team', () => {
    const store = createTeamChallengeStore();
    const teams = store.teams();
    const ids = new Set(teams.map((team) => team.teamId));

    expect(ids.size).toBe(teams.length);
    expect(teams.some((team) => (team.employeeCount ?? 0) === 0)).toBe(true);
    expect(teams).toHaveLength(SEED_TEAMS.length);
  });

  it('exposes the challenge window with the offset-per-employee metric', () => {
    const store = createTeamChallengeStore();
    expect(store.challenge()).toEqual(DEFAULT_CHALLENGE);
    expect(store.challenge().metric).toBe('offset_per_employee');
  });

  it('credits offset and trees to a team', () => {
    const store = createTeamChallengeStore();
    const before = store.teams().find((team) => team.teamId === 'product');
    expect(before).toBeDefined();

    const updated = store.recordOffset('product', { offsetTonnes: 45, trees: 180 });

    expect(updated.totalOffsetTonnes).toBe((before?.totalOffsetTonnes ?? 0) + 45);
    expect(updated.treesPlanted).toBe((before?.treesPlanted ?? 0) + 180);

    const persisted = store.teams().find((team) => team.teamId === 'product');
    expect(persisted?.totalOffsetTonnes).toBe(updated.totalOffsetTonnes);
  });

  it('rejects unknown teams and invalid amounts', () => {
    const store = createTeamChallengeStore();

    expect(() => store.recordOffset('nope', { offsetTonnes: 10 })).toThrow(RangeError);
    expect(() => store.recordOffset('product', { offsetTonnes: 0 })).toThrow(RangeError);
    expect(() => store.recordOffset('product', { offsetTonnes: -5 })).toThrow(RangeError);
    expect(() => store.recordOffset('product', { offsetTonnes: 10, trees: -1 })).toThrow(
      RangeError
    );
    expect(() => store.recordOffset('product', { offsetTonnes: 10, trees: 1.5 })).toThrow(
      RangeError
    );
  });

  it('returns defensive copies so callers cannot mutate the store', () => {
    const store = createTeamChallengeStore();
    const first = store.teams()[0];
    const original = first.totalOffsetTonnes;

    first.totalOffsetTonnes = 999_999;

    expect(store.teams()[0].totalOffsetTonnes).toBe(original);
  });
});

describe('getTeamChallengeStore', () => {
  it('returns the same process-wide instance', () => {
    expect(getTeamChallengeStore()).toBe(getTeamChallengeStore());
  });
});
