import { type Metadata } from 'next';
import { TeamForestPanel } from '@/components/organisms/TeamForestPanel';

export const metadata: Metadata = {
  title: 'Team Forest | Dashboard',
  description:
    'Manage your sponsor team forest — track collective tree-planting progress, celebrate milestones, and share tree photos with your team.',
};

/**
 * Route: /dashboard/team-forest
 * Renders the sponsor team forest dashboard (Issue #1104).
 */
export default function TeamForestPage() {
  return (
    <main
      className="min-h-screen bg-background pt-24 pb-16 px-4 md:px-8 lg:px-12"
      aria-label="Team forest dashboard"
    >
      <div className="max-w-7xl mx-auto">
        <TeamForestPanel />
      </div>
    </main>
  );
}