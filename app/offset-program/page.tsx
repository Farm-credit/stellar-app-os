import type { Metadata } from 'next';
import { CorporateOffsetTool } from '@/components/organisms/CorporateOffsetTool/CorporateOffsetTool';

export const metadata: Metadata = {
  title: 'Corporate Carbon Offset Program | Targets & Auto-Purchase',
  description:
    'Set corporate carbon offset targets, automate verified credit purchasing within monthly budget caps, and export monthly ESG documentation.',
};

export default function OffsetProgramPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <CorporateOffsetTool />
    </main>
  );
}
