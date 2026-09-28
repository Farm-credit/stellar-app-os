import type { Metadata } from 'next';
import { TeamChallengesBoard } from '@/components/organisms/TeamChallenges/TeamChallengesBoard';
import type { TeamChallengeEntry } from '@/lib/team-challenges/ranking';

export const metadata: Metadata = {
  title: 'Team Challenges | Farm-credit',
  description:
    'Corporate offset goals: employee teams compete on offset per employee, and the best ratio wins recognition.',
};

// v1 ships the surface with a deterministic sample board. When team activity is
// wired through `app/api/challenges`, replace this with the fetched entries —
// the board already ranks whatever `TeamChallengeEntry[]` it receives.
const sampleTeams: TeamChallengeEntry[] = [
  { teamId: 'field-ops', teamName: 'Field Ops', totalOffsetTonnes: 480, employeeCount: 24 },
  { teamId: 'product', teamName: 'Product', totalOffsetTonnes: 315, employeeCount: 15 },
  { teamId: 'finance', teamName: 'Finance', totalOffsetTonnes: 190, employeeCount: 8 },
  { teamId: 'people', teamName: 'People & Culture', totalOffsetTonnes: 96, employeeCount: 12 },
  { teamId: 'contractors', teamName: 'Contractors', totalOffsetTonnes: 140 },
];

export default function TeamChallengesPage() {
  return (
    <main className="container mx-auto px-4 py-8">
      <TeamChallengesBoard teams={sampleTeams} />
    </main>
  );
}
