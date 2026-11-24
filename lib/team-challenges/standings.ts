// Copyright 2024 Farm-credit Contributors
// Licensed under the Apache License, Version 2.0

/**
 * Corporate offset goals — team challenge standings (Issue #1361)
 *
 * Read model for the gamified team challenge: the offset-per-employee ratio of
 * every competing employee team, the recognised winner, and the aggregate
 * totals shown alongside the board. The ranking rules themselves live in
 * `./ranking`; this module only shapes the snapshot so the dashboard, the API
 * and the tests always agree on what "winning" means.
 */

import { rankTeams, type RankedTeam, type TeamChallengeEntry } from './ranking';

/** An employee team competing on the challenge. */
export interface EmployeeTeam extends TeamChallengeEntry {
  /** Business unit / department the team represents. */
  department: string;
  /** Trees the team has planted this cycle, shown for context next to the ratio. */
  treesPlanted: number;
}

export type TeamChallengeMetric = 'offset_per_employee';

/** The window and recognition rules a set of teams competes under. */
export interface TeamChallengeWindow {
  id: string;
  name: string;
  description: string;
  /** Only `offset_per_employee` is supported today; the field is explicit for the API. */
  metric: TeamChallengeMetric;
  startsAt: string;
  endsAt: string;
  /** What the winning team receives, e.g. a trophy plus a matched donation. */
  recognition: string;
}

export interface TeamChallengeTotals {
  teams: number;
  eligibleTeams: number;
  employees: number;
  totalOffsetTonnes: number;
  treesPlanted: number;
}

export interface TeamChallengeStandings {
  challenge: TeamChallengeWindow;
  generatedAt: string;
  totals: TeamChallengeTotals;
  rankings: RankedTeam[];
  /** The recognised team, or `null` when no team has any employees. */
  winner: RankedTeam | null;
}

function normalizeOffset(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function normalizeEmployees(value: number | null | undefined): number {
  return Math.max(0, Math.floor(typeof value === 'number' && Number.isFinite(value) ? value : 0));
}

function sum(teams: readonly EmployeeTeam[], pick: (team: EmployeeTeam) => number): number {
  return teams.reduce((total, team) => total + pick(team), 0);
}

/**
 * Builds the standings snapshot for a challenge. Pure and deterministic: the
 * same teams, challenge and clock always produce the same result.
 */
export function buildTeamChallengeStandings(
  teams: readonly EmployeeTeam[],
  challenge: TeamChallengeWindow,
  now: Date = new Date()
): TeamChallengeStandings {
  const rankings = rankTeams(teams);
  const winner = rankings.find((team) => team.isEligible) ?? null;

  return {
    challenge,
    generatedAt: now.toISOString(),
    totals: {
      teams: teams.length,
      eligibleTeams: teams.filter((team) => normalizeEmployees(team.employeeCount) > 0).length,
      employees: sum(teams, (team) => normalizeEmployees(team.employeeCount)),
      totalOffsetTonnes: sum(teams, (team) => normalizeOffset(team.totalOffsetTonnes)),
      treesPlanted: sum(teams, (team) => Math.max(0, normalizeOffset(team.treesPlanted))),
    },
    rankings,
    winner,
  };
}
