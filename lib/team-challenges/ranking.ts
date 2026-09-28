// Copyright 2024 Farm-credit Contributors
// Licensed under the Apache License, Version 2.0

/**
 * Corporate offset goals — team challenge ranking (Issue #1361)
 *
 * Employee teams compete on sustainability goals and the team with the best
 * offset-per-employee ratio wins recognition. This module is the pure,
 * deterministic core of that feature: it contains no I/O, so it can be unit
 * tested in isolation and reused by the dashboard surface (and, later, by an
 * API layer) without pulling in a database or a React runtime.
 *
 * Ranking rules:
 * - The metric is `totalOffsetTonnes / employeeCount`.
 * - A team with no employees (0, absent, negative or non-finite) cannot have a
 *   ratio, so it is marked ineligible, given a ratio of 0, and ranked below
 *   every eligible team.
 * - Ties on the ratio share a rank and the next rank is skipped, matching the
 *   standard competition ranking used elsewhere in the app (1, 2, 2, 4).
 * - Ties are broken deterministically by total offset, then team name, then
 *   team id so the surfaced order never depends on input order.
 */

export interface TeamChallengeEntry {
  teamId: string;
  teamName: string;
  /** Total CO₂e offset credited to the team, in tonnes. */
  totalOffsetTonnes: number;
  /** Number of employees on the team. Zero or absent makes the team ineligible. */
  employeeCount?: number | null;
}

export interface RankedTeam {
  /** Competition rank; eligible teams always rank ahead of ineligible ones. */
  rank: number;
  teamId: string;
  teamName: string;
  /** Offset normalised to a finite, non-negative number of tonnes. */
  totalOffsetTonnes: number;
  /** Employee count normalised to a non-negative integer. */
  employeeCount: number;
  /** `totalOffsetTonnes / employeeCount`, or 0 when the team is ineligible. */
  offsetPerEmployee: number;
  /** False when the team has no employees and therefore cannot be scored. */
  isEligible: boolean;
}

/** Coerces anything that is not a finite number to 0. */
function toFiniteNumber(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function normalizeEntry(entry: TeamChallengeEntry): RankedTeam {
  const totalOffsetTonnes = Math.max(0, toFiniteNumber(entry.totalOffsetTonnes));
  const employeeCount = Math.max(0, Math.floor(toFiniteNumber(entry.employeeCount)));
  const isEligible = employeeCount > 0;

  return {
    rank: 0,
    teamId: entry.teamId,
    teamName: entry.teamName,
    totalOffsetTonnes,
    employeeCount,
    offsetPerEmployee: isEligible ? totalOffsetTonnes / employeeCount : 0,
    isEligible,
  };
}

/**
 * Offset-per-employee ratio for a single team.
 * Returns 0 when the employee count is missing or not positive.
 */
export function computeOffsetPerEmployee(
  totalOffsetTonnes: number,
  employeeCount?: number | null
): number {
  const offset = Math.max(0, toFiniteNumber(totalOffsetTonnes));
  const employees = Math.floor(toFiniteNumber(employeeCount));
  if (employees <= 0) return 0;
  return offset / employees;
}

function compareRankedTeams(a: RankedTeam, b: RankedTeam): number {
  if (a.isEligible !== b.isEligible) return a.isEligible ? -1 : 1;

  if (a.isEligible && a.offsetPerEmployee !== b.offsetPerEmployee) {
    return b.offsetPerEmployee - a.offsetPerEmployee;
  }
  if (a.totalOffsetTonnes !== b.totalOffsetTonnes) {
    return b.totalOffsetTonnes - a.totalOffsetTonnes;
  }

  const byName = a.teamName.localeCompare(b.teamName);
  if (byName !== 0) return byName;
  return a.teamId.localeCompare(b.teamId);
}

/** Two teams tie only when they are both eligible with the same ratio. */
function rankingKey(team: RankedTeam): string {
  return team.isEligible ? `eligible:${team.offsetPerEmployee}` : 'ineligible';
}

/**
 * Ranks teams by offset-per-employee using standard competition ranking.
 * Ineligible teams (no employees) are returned last, all sharing one rank,
 * with `isEligible: false`. The input array is never mutated.
 */
export function rankTeams(entries: readonly TeamChallengeEntry[]): RankedTeam[] {
  const ranked = entries.map(normalizeEntry).sort(compareRankedTeams);

  let previousKey: string | null = null;
  let previousRank = 0;

  return ranked.map((team, index) => {
    const key = rankingKey(team);
    const rank = key === previousKey ? previousRank : index + 1;
    previousKey = key;
    previousRank = rank;
    return { ...team, rank };
  });
}

/**
 * Returns the recognised team — the eligible team with the highest ratio — or
 * `null` when there are no entries or none of them has any employees.
 */
export function pickWinner(entries: readonly TeamChallengeEntry[]): RankedTeam | null {
  return rankTeams(entries).find((team) => team.isEligible) ?? null;
}
