import type { Metadata } from 'next';
import { TreeSponsorLeaderboard } from '@/components/organisms/leaderboard/TreeSponsorLeaderboard';

export const metadata: Metadata = { title: 'Tree sponsorship leaderboard | FarmCredit' };
export default function TreeSponsorLeaderboardPage() {
  return <TreeSponsorLeaderboard />;
}
