import type { Metadata } from 'next';
import { TeamChallengesBoard } from '@/components/organisms/TeamChallenges/TeamChallengesBoard';
import { buildTeamChallengeStandings } from '@/lib/team-challenges/standings';
import { getTeamChallengeStore } from '@/lib/team-challenges/teamChallengeStore';

export const metadata: Metadata = {
  title: 'Team Challenges | Farm-credit',
  description:
    'Corporate offset goals: employee teams compete on offset per employee, and the best ratio wins recognition.',
};

// Standings depend on the in-memory challenge store, so render per request
// rather than freezing a build-time snapshot.
export const dynamic = 'force-dynamic';

export default function TeamChallengesPage() {
  const store = getTeamChallengeStore();
  const standings = buildTeamChallengeStandings(store.teams(), store.challenge());

  return (
    <main className="container mx-auto px-4 py-8">
      <TeamChallengesBoard
        teams={standings.rankings}
        challenge={standings.challenge}
        totals={standings.totals}
      />
    </main>
  );
}
