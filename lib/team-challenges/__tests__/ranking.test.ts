import { describe, expect, it } from 'vitest';
import {
  computeOffsetPerEmployee,
  pickWinner,
  rankTeams,
  type TeamChallengeEntry,
} from '@/lib/team-challenges/ranking';

function team(
  teamId: string,
  totalOffsetTonnes: number,
  employeeCount?: number | null
): TeamChallengeEntry {
  return { teamId, teamName: teamId.toUpperCase(), totalOffsetTonnes, employeeCount };
}

describe('computeOffsetPerEmployee', () => {
  it('divides total offset by the employee count', () => {
    expect(computeOffsetPerEmployee(120, 8)).toBe(15);
    expect(computeOffsetPerEmployee(10, 4)).toBe(2.5);
  });

  it('returns 0 for zero, absent or invalid employee counts', () => {
    expect(computeOffsetPerEmployee(120, 0)).toBe(0);
    expect(computeOffsetPerEmployee(120)).toBe(0);
    expect(computeOffsetPerEmployee(120, null)).toBe(0);
    expect(computeOffsetPerEmployee(120, -3)).toBe(0);
  });

  it('normalises non-finite input instead of leaking NaN', () => {
    expect(computeOffsetPerEmployee(Number.NaN, 5)).toBe(0);
    expect(computeOffsetPerEmployee(Number.POSITIVE_INFINITY, 5)).toBe(0);
    expect(computeOffsetPerEmployee(120, Number.NaN)).toBe(0);
  });
});

describe('rankTeams', () => {
  it('orders teams by offset per employee, best first', () => {
    const ranked = rankTeams([
      team('mid', 100, 10), // 10t / employee
      team('best', 300, 10), // 30t / employee
      team('worst', 60, 10), // 6t / employee
    ]);

    expect(ranked.map((r) => [r.teamId, r.rank, r.offsetPerEmployee])).toEqual([
      ['best', 1, 30],
      ['mid', 2, 10],
      ['worst', 3, 6],
    ]);
  });

  it('rewards a high ratio even when the absolute offset is lower', () => {
    const ranked = rankTeams([
      team('large', 1000, 100), // 10t / employee
      team('small', 30, 2), // 15t / employee
    ]);

    expect(ranked.map((r) => r.teamId)).toEqual(['small', 'large']);
  });

  it('shares a rank on equal ratios and skips the next rank', () => {
    const ranked = rankTeams([
      team('a', 100, 10), // 10t / employee
      team('b', 100, 10), // 10t / employee
      team('c', 50, 10), // 5t / employee
    ]);

    expect(ranked.map((r) => [r.teamId, r.rank])).toEqual([
      ['a', 1],
      ['b', 1],
      ['c', 3],
    ]);
  });

  it('breaks ratio ties deterministically by total offset, name then id', () => {
    const offsetTieBreak = rankTeams([team('low', 50, 5), team('high', 100, 10)]);
    expect(offsetTieBreak.map((r) => r.teamId)).toEqual(['high', 'low']);

    // Same offset and ratio, so the name (derived from the id here) decides.
    const nameTieBreak = rankTeams([team('zulu', 100, 10), team('alpha', 100, 10)]);
    expect(nameTieBreak.map((r) => r.teamId)).toEqual(['alpha', 'zulu']);
  });

  it('marks teams with zero or absent employees ineligible and ranks them last', () => {
    const ranked = rankTeams([
      { teamId: 'no-count', teamName: 'No Count', totalOffsetTonnes: 500 },
      { teamId: 'zero', teamName: 'Zero', totalOffsetTonnes: 500, employeeCount: 0 },
      { teamId: 'eligible', teamName: 'Eligible', totalOffsetTonnes: 10, employeeCount: 5 },
    ]);

    expect(ranked.map((r) => [r.teamId, r.rank, r.offsetPerEmployee, r.isEligible])).toEqual([
      ['eligible', 1, 2, true],
      ['no-count', 2, 0, false],
      ['zero', 2, 0, false],
    ]);
  });

  it('returns an empty board for empty input', () => {
    expect(rankTeams([])).toEqual([]);
  });

  it('does not mutate the input entries', () => {
    const entries = [team('a', 100, 10)];
    const snapshot = JSON.parse(JSON.stringify(entries));

    const ranked = rankTeams(entries);

    expect(entries).toEqual(snapshot);
    expect(ranked[0]).not.toBe(entries[0]);
  });
});

describe('pickWinner', () => {
  it('picks the team with the best offset-per-employee ratio', () => {
    const winner = pickWinner([
      team('runnerUp', 200, 20), // 10t / employee
      team('winner', 90, 6), // 15t / employee
    ]);

    expect(winner).toMatchObject({
      teamId: 'winner',
      rank: 1,
      offsetPerEmployee: 15,
      isEligible: true,
    });
  });

  it('returns null for empty input', () => {
    expect(pickWinner([])).toBeNull();
  });

  it('returns null when every team is ineligible', () => {
    expect(
      pickWinner([team('a', 100, 0), { teamId: 'b', teamName: 'B', totalOffsetTonnes: 50 }])
    ).toBeNull();
  });

  it('is deterministic when ratios tie', () => {
    const first = pickWinner([team('zulu', 100, 10), team('alpha', 100, 10)]);
    const second = pickWinner([team('alpha', 100, 10), team('zulu', 100, 10)]);

    expect(first?.teamId).toBe('alpha');
    expect(second?.teamId).toBe('alpha');
  });
});
