import React from 'react';
import { AchievementBadgesCard } from '@/components/molecules/AchievementBadgesCard';

export const metadata = {
  title: 'Achievement Badges | FarmCredit Stellar OS',
  description: 'Track your sponsorship milestone achievements: First Tree, Century Club, Millionaire, and Explorer.',
};

export default function BadgesDashboardPage() {
  return (
    <main className="container mx-auto px-4 py-8 max-w-5xl">
      <AchievementBadgesCard />
    </main>
  );
}
