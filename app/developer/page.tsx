import type { Metadata } from 'next';
import { ApiSandbox } from '@/components/organisms/DeveloperPortal/ApiSandbox';

export const metadata: Metadata = {
  title: 'Developer Portal & API Sandbox | FarmCredit',
  description:
    'Integrate tree sponsorship data with our REST API. Test endpoints for trees, projects, species, and CO2 stats live in the interactive OAuth2 sandbox.',
};

export default function DeveloperPortalPage() {
  return (
    <main className="min-h-screen bg-slate-50 py-8">
      <ApiSandbox />
    </main>
  );
}
