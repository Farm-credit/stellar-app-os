'use client';

/**
 * Corporate offset goals — team challenges board (Issue #1361)
 *
 * Surfaces the v1 team-challenge standings: the team with the best
 * offset-per-employee ratio is recognised, and every team is listed with its
 * ratio, headcount and total offset. Ranking comes from the pure helper in
 * `@/lib/team-challenges/ranking`, so the UI and the tests agree on the rules.
 */

import { useMemo } from 'react';
import { Trophy, Users, TrendingUp } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/molecules/Card';
import { Text } from '@/components/atoms/Text';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { pickWinner, rankTeams, type TeamChallengeEntry } from '@/lib/team-challenges/ranking';

export interface TeamChallengesBoardProps {
  teams: readonly TeamChallengeEntry[];
}

const numberFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });

function formatTonnes(value: number): string {
  return `${numberFormatter.format(value)}t`;
}

function formatRatio(value: number): string {
  return `${numberFormatter.format(value)}t / employee`;
}

export function TeamChallengesBoard({ teams }: TeamChallengesBoardProps) {
  const rankings = useMemo(() => rankTeams(teams), [teams]);
  const winner = useMemo(() => pickWinner(teams), [teams]);
  const eligibleCount = rankings.filter((team) => team.isEligible).length;

  return (
    <section className="space-y-8">
      <header className="flex flex-col gap-2">
        <Text variant="h1" className="text-foreground">
          Corporate offset goals
        </Text>
        <Text variant="muted" as="p" className="max-w-2xl">
          Employee teams compete on sustainability goals. The team with the best offset-per-employee
          ratio wins recognition — total offset is split by team size so smaller teams can outrank
          larger ones.
        </Text>
      </header>

      {rankings.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Users className="h-10 w-10 text-muted-foreground" aria-hidden />
            <Text variant="h4">No teams are competing yet</Text>
            <Text variant="muted" as="p">
              Create employee teams to start tracking their offset per employee.
            </Text>
          </CardContent>
        </Card>
      ) : (
        <>
          {winner ? (
            <Card className="border-stellar-blue/40 bg-stellar-blue/5">
              <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
                <div className="space-y-1.5">
                  <CardTitle className="flex items-center gap-2 text-xl">
                    <Trophy className="h-5 w-5 text-amber-500" aria-hidden />
                    {winner.teamName}
                  </CardTitle>
                  <CardDescription>
                    Wins recognition with the best offset-per-employee ratio.
                  </CardDescription>
                </div>
                <Text variant="label" className="whitespace-nowrap">
                  #1 of {eligibleCount} eligible
                </Text>
              </CardHeader>
              <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <Text variant="label">Offset / employee</Text>
                  <Text variant="h3" className="text-stellar-green">
                    {formatRatio(winner.offsetPerEmployee)}
                  </Text>
                </div>
                <div>
                  <Text variant="label">Team offset</Text>
                  <Text variant="h3">{formatTonnes(winner.totalOffsetTonnes)}</Text>
                </div>
                <div>
                  <Text variant="label">Employees</Text>
                  <Text variant="h3">{winner.employeeCount}</Text>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="flex items-center gap-3 py-6">
                <TrendingUp className="h-5 w-5 text-muted-foreground" aria-hidden />
                <Text variant="muted" as="p">
                  No team is eligible yet — add employees to a team to record an
                  offset-per-employee ratio.
                </Text>
              </CardContent>
            </Card>
          )}

          <div className="overflow-hidden rounded-xl border">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="w-20">Rank</TableHead>
                  <TableHead>Team</TableHead>
                  <TableHead className="text-right">Employees</TableHead>
                  <TableHead className="text-right">Total offset</TableHead>
                  <TableHead className="text-right">Offset / employee</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rankings.map((team) => (
                  <TableRow key={team.teamId}>
                    <TableCell className="font-medium">
                      {team.isEligible ? `#${team.rank}` : '—'}
                    </TableCell>
                    <TableCell className="font-medium">
                      {team.teamName}
                      {!team.isEligible && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          (not eligible)
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">{team.employeeCount}</TableCell>
                    <TableCell className="text-right">
                      {formatTonnes(team.totalOffsetTonnes)}
                    </TableCell>
                    <TableCell className="text-right">
                      {team.isEligible ? (
                        formatRatio(team.offsetPerEmployee)
                      ) : (
                        <span className="text-muted-foreground">no employees</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </section>
  );
}
