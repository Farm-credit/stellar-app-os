import type { Metadata } from 'next';
import { SponsorForum } from '@/components/organisms/SponsorForum';

export const metadata: Metadata = {
  title: 'Sponsor Community Forum',
  description:
    'Connect with tree sponsors to discuss species, conservation, volunteer meetups, and platform help.',
};

export default function SponsorForumPage() {
  return (
    <main className="min-h-screen bg-background px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <SponsorForum />
      </div>
    </main>
  );
}
