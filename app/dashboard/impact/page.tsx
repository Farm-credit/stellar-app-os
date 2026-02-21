/**
 * Impact Dashboard Page
 * Route: /dashboard/impact
 *
 * Main page component for viewing environmental impact metrics.
 * Implements Next.js 16 App Router patterns.
 */

import { ImpactDashboard } from "@/components/organisms/ImpactDashboard/ImpactDashboard";

export const metadata = {
  title: "Impact Dashboard | Environmental Contribution Tracker",
  description:
    "Track your environmental impact, CO2 offset, tree planting contributions, and see your real-world difference across global projects.",
};

export default function ImpactPage() {
  return (
    <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-12 max-w-7xl">
      <ImpactDashboard />
    </main>
  );
}
