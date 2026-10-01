/**
 * Team challenges board — Issue #1361
 *
 * The board is the visible half of the gamified challenge: it must surface the
 * team with the best offset-per-employee ratio as the recognised winner and
 * keep teams with no employees out of the ranking entirely.
 */

import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TeamChallengesBoard } from '../TeamChallengesBoard';
import type { TeamChallengeEntry } from '@/lib/team-challenges/ranking';
import type { TeamChallengeWindow } from '@/lib/team-challenges/standings';

const CHALLENGE: Pick<TeamChallengeWindow, 'name' | 'endsAt' | 'recognition'> = {
  name: 'Q3 Sustainability Sprint',
  endsAt: '2026-09-30T23:59:59.000Z',
  recognition: 'Champions trophy and a matched donation',
};

/** Team name of each body row, in the order the board renders them. */
function rowNames(): (string | null)[] {
  return screen
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('cell')[1]?.textContent ?? null);
}

/**
 * The totals strip renders above the winner card, so the first occurrence of a
 * label is always its stat tile; the tile reads `label` + `value`.
 */
function stat(label: string): string {
  return screen.getAllByText(label)[0].parentElement?.textContent ?? '';
}

describe('TeamChallengesBoard', () => {
  it('recognises the best offset-per-employee ratio, not the largest total', () => {
    render(
      <TeamChallengesBoard
        teams={[
          { teamId: 'large', teamName: 'Large', totalOffsetTonnes: 1000, employeeCount: 100 },
          { teamId: 'small', teamName: 'Small', totalOffsetTonnes: 30, employeeCount: 2 },
        ]}
      />
    );

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Corporate offset goals');
    // 15t/employee beats 10t/employee even though Large offset 33x more.
    expect(screen.getByRole('heading', { level: 3, name: 'Small' })).toBeInTheDocument();
    expect(screen.getAllByText('15t / employee').length).toBeGreaterThan(0);
    expect(rowNames()[0]).toContain('Small');
    expect(rowNames()[1]).toContain('Large');
  });

  it('shows the challenge name, deadline and recognition prize', () => {
    render(
      <TeamChallengesBoard
        teams={[
          { teamId: 'product', teamName: 'Product', totalOffsetTonnes: 315, employeeCount: 15 },
        ]}
        challenge={CHALLENGE}
      />
    );

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(CHALLENGE.name);
    expect(screen.getByText(/challenge closes/i)).toBeInTheDocument();
    expect(screen.getByText(`Wins recognition — ${CHALLENGE.recognition}`)).toBeInTheDocument();
  });

  it('ranks teams without employees last and marks them ineligible', () => {
    render(
      <TeamChallengesBoard
        teams={[
          { teamId: 'product', teamName: 'Product', totalOffsetTonnes: 315, employeeCount: 15 },
          {
            teamId: 'contractors',
            teamName: 'Contractors',
            totalOffsetTonnes: 140,
            employeeCount: 0,
          },
        ]}
      />
    );

    expect(rowNames()[0]).toContain('Product');
    expect(rowNames()[1]).toContain('Contractors');
    expect(screen.getByText('(not eligible)')).toBeInTheDocument();
    expect(screen.getByText('no employees')).toBeInTheDocument();
    // An ineligible team never takes the winner slot, even with more offset.
    expect(screen.getByRole('heading', { level: 3, name: 'Product' })).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { level: 3, name: 'Contractors' })
    ).not.toBeInTheDocument();
  });

  it('summarises the totals strip across competing teams', () => {
    render(
      <TeamChallengesBoard
        teams={[
          { teamId: 'a', teamName: 'A', totalOffsetTonnes: 120, employeeCount: 10 },
          { teamId: 'b', teamName: 'B', totalOffsetTonnes: 80, employeeCount: 5 },
          { teamId: 'c', teamName: 'C', totalOffsetTonnes: 50, employeeCount: 0 },
        ]}
      />
    );

    expect(stat('Teams')).toBe('Teams3');
    expect(stat('Employees')).toBe('Employees15');
    expect(stat('Total offset')).toBe('Total offset250t');
    expect(stat('Eligible teams')).toBe('Eligible teams2');
  });

  it('prefers server-computed totals when they are provided', () => {
    render(
      <TeamChallengesBoard
        teams={[{ teamId: 'a', teamName: 'A', totalOffsetTonnes: 120, employeeCount: 10 }]}
        totals={{
          teams: 1,
          eligibleTeams: 1,
          employees: 10,
          totalOffsetTonnes: 999,
          treesPlanted: 4000,
        }}
      />
    );

    expect(stat('Total offset')).toBe('Total offset999t');
  });

  it('prompts for teams when nobody is competing', () => {
    render(<TeamChallengesBoard teams={[]} />);

    expect(
      screen.getByRole('heading', { name: /no teams are competing yet/i })
    ).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('explains that nobody can win while every team is ineligible', () => {
    render(
      <TeamChallengesBoard
        teams={[
          {
            teamId: 'contractors',
            teamName: 'Contractors',
            totalOffsetTonnes: 140,
            employeeCount: 0,
          },
        ]}
      />
    );

    expect(screen.getByText(/no team is eligible yet/i)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 3 })).not.toBeInTheDocument();
  });

  it('does not mutate the caller-supplied team list', () => {
    const teams: TeamChallengeEntry[] = [
      { teamId: 'a', teamName: 'A', totalOffsetTonnes: 60, employeeCount: 2 },
    ];
    const snapshot = JSON.stringify(teams);

    render(<TeamChallengesBoard teams={teams} />);

    expect(JSON.stringify(teams)).toBe(snapshot);
  });
});
