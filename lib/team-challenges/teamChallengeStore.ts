// Copyright 2024 Farm-credit Contributors
// Licensed under the Apache License, Version 2.0

/**
 * In-memory employee-team store backing the corporate offset challenge
 * (Issue #1361).
 *
 * The store is the single source of truth the standings API and the dashboard
 * read from. It ships with a deterministic seed so the board has meaningful
 * data in demos and previews, and exposes `recordOffset` so real team activity
 * (sponsorships, carbon-offset purchases) can be credited as it happens. Once
 * team contributions live in the database, keep this interface and swap the
 * seed for a query — the consumers only depend on `TeamChallengeStore`.
 */

import type { EmployeeTeam, TeamChallengeWindow } from './standings';

export const SEED_TEAMS: readonly EmployeeTeam[] = [
  {
    teamId: 'field-ops',
    teamName: 'Field Ops',
    department: 'Operations',
    employeeCount: 24,
    totalOffsetTonnes: 480,
    treesPlanted: 1920,
  },
  {
    teamId: 'product',
    teamName: 'Product',
    department: 'Product & Design',
    employeeCount: 15,
    totalOffsetTonnes: 315,
    treesPlanted: 1260,
  },
  {
    teamId: 'people',
    teamName: 'People & Culture',
    department: 'People',
    employeeCount: 12,
    totalOffsetTonnes: 180,
    treesPlanted: 720,
  },
  {
    teamId: 'finance',
    teamName: 'Finance',
    department: 'Finance',
    employeeCount: 8,
    totalOffsetTonnes: 96,
    treesPlanted: 384,
  },
  {
    // Zero employees: cannot produce a ratio, so it is ranked last and never wins.
    teamId: 'contractors',
    teamName: 'Contractors',
    department: 'External',
    employeeCount: 0,
    totalOffsetTonnes: 140,
    treesPlanted: 560,
  },
];

export const DEFAULT_CHALLENGE: TeamChallengeWindow = {
  id: 'q3-2026-sustainability-sprint',
  name: 'Q3 Sustainability Sprint',
  description:
    'Employee teams log the carbon they offset this quarter. The team with the best offset-per-employee ratio is recognised at the all-hands.',
  metric: 'offset_per_employee',
  startsAt: '2026-07-01T00:00:00.000Z',
  endsAt: '2026-09-30T23:59:59.000Z',
  recognition:
    'Sustainability Champions trophy + a matched donation to the team’s chosen planting project',
};

export interface RecordOffsetInput {
  /** CO₂e offset to credit, in tonnes. Must be positive. */
  offsetTonnes: number;
  /** Optional trees planted alongside the offset, for context. */
  trees?: number;
}

export interface TeamChallengeStore {
  /** Snapshot of the competing teams, safest to treat as immutable. */
  teams(): EmployeeTeam[];
  /** The active challenge window and its recognition rules. */
  challenge(): TeamChallengeWindow;
  /** Credits offset (and optional trees) to a team and returns its updated record. */
  recordOffset(teamId: string, input: RecordOffsetInput): EmployeeTeam;
}

export function createTeamChallengeStore(
  seedTeams: readonly EmployeeTeam[] = SEED_TEAMS,
  challenge: TeamChallengeWindow = DEFAULT_CHALLENGE
): TeamChallengeStore {
  const byId = new Map(seedTeams.map((team) => [team.teamId, { ...team }]));

  return {
    teams: () => [...byId.values()].map((team) => ({ ...team })),

    challenge: () => ({ ...challenge }),

    recordOffset(teamId, { offsetTonnes, trees = 0 }) {
      const team = byId.get(teamId);
      if (!team) throw new RangeError(`Unknown team: ${teamId}`);
      if (!Number.isFinite(offsetTonnes) || offsetTonnes <= 0) {
        throw new RangeError('offsetTonnes must be a positive number');
      }
      if (!Number.isInteger(trees) || trees < 0) {
        throw new RangeError('trees must be a non-negative integer');
      }

      const updated: EmployeeTeam = {
        ...team,
        totalOffsetTonnes: team.totalOffsetTonnes + offsetTonnes,
        treesPlanted: team.treesPlanted + trees,
      };
      byId.set(teamId, updated);
      return { ...updated };
    },
  };
}

let defaultStore: TeamChallengeStore | null = null;

/** Process-wide store used by the challenge API and the dashboard. */
export function getTeamChallengeStore(): TeamChallengeStore {
  if (!defaultStore) defaultStore = createTeamChallengeStore();
  return defaultStore;
}
