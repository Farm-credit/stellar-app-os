import { describe, expect, it } from 'vitest';
import {
  buildTeamChallengeStandings,
  type EmployeeTeam,
  type TeamChallengeWindow,
} from '@/lib/team-challenges/standings';

const challenge: TeamChallengeWindow = {
  id: 'q3-sprint',
  name: 'Q3 Sustainability Sprint',
  description: 'Employee teams compete on offset per employee.',
  metric: 'offset_per_employee',
  startsAt: '2026-07-01T00:00:00.000Z',
  endsAt: '2026-09-30T23:59:59.000Z',
  recognition: 'Sustainability Champions trophy',
};

function team(
  overrides: Partial<EmployeeTeam> & Pick<EmployeeTeam, 'teamId' | 'teamName' | 'totalOffsetTonnes'>
): EmployeeTeam {
  return { department: 'Ops', employeeCount: 1, treesPlanted: 0, ...overrides };
}

describe('buildTeamChallengeStandings', () => {
  it('recognises the team with the best offset-per-employee ratio', () => {
    const standings = buildTeamChallengeStandings(
      [
        team({ teamId: 'large', teamName: 'Large', totalOffsetTonnes: 1000, employeeCount: 100 }),
        team({ teamId: 'small', teamName: 'Small', totalOffsetTonnes: 30, employeeCount: 2 }),
      ],
      challenge
    );

    // 15t/employee beats 10t/employee despite the smaller absolute offset.
    expect(standings.winner?.teamId).toBe('small');
    expect(standings.winner?.offsetPerEmployee).toBe(15);
    expect(standings.rankings.map((r) => r.teamId)).toEqual(['small', 'large']);
  });

  it('aggregates totals across the competing teams', () => {
    const standings = buildTeamChallengeStandings(
      [
        team({
          teamId: 'a',
          teamName: 'A',
          totalOffsetTonnes: 120,
          employeeCount: 10,
          treesPlanted: 480,
        }),
        team({
          teamId: 'b',
          teamName: 'B',
          totalOffsetTonnes: 80,
          employeeCount: 5,
          treesPlanted: 320,
        }),
        team({
          teamId: 'c',
          teamName: 'C',
          totalOffsetTonnes: 50,
          employeeCount: 0,
          treesPlanted: 200,
        }),
      ],
      challenge
    );

    expect(standings.totals).toEqual({
      teams: 3,
      eligibleTeams: 2,
      employees: 15,
      totalOffsetTonnes: 250,
      treesPlanted: 1000,
    });
  });

  it('returns a null winner when no team has employees', () => {
    const standings = buildTeamChallengeStandings(
      [team({ teamId: 'a', teamName: 'A', totalOffsetTonnes: 500, employeeCount: 0 })],
      challenge
    );

    expect(standings.winner).toBeNull();
    expect(standings.rankings[0].isEligible).toBe(false);
  });

  it('is empty-safe', () => {
    const standings = buildTeamChallengeStandings([], challenge);
    expect(standings.rankings).toEqual([]);
    expect(standings.winner).toBeNull();
    expect(standings.totals.teams).toBe(0);
  });

  it('stamps the snapshot with the provided clock', () => {
    const now = new Date('2026-09-15T12:00:00.000Z');
    const standings = buildTeamChallengeStandings(
      [team({ teamId: 'a', teamName: 'A', totalOffsetTonnes: 10, employeeCount: 2 })],
      challenge,
      now
    );

    expect(standings.generatedAt).toBe('2026-09-15T12:00:00.000Z');
    expect(standings.challenge.id).toBe('q3-sprint');
  });
});
