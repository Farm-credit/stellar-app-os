import { type Metadata } from 'next';

import { WildlifeSightingLog } from '@/components/organisms/Wildlife/WildlifeSightingLog';

export const metadata: Metadata = {
  title: 'Wildlife Sighting Log | Stellar App OS',
  description:
    'Field teams and approved citizen scientists submit wildlife sightings that drive each project’s habitat quality score and featured photos.',
};

export default function FieldTeamWildlifePage() {
  return (
    <main className="min-h-screen bg-slate-50 pt-24 pb-16 px-4 md:px-8">
      <WildlifeSightingLog />
    </main>
  );
}
