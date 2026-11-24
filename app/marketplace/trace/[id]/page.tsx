import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
  findCreditTrace,
  summarizeTrace,
  toPublicTrace,
  verifyTrace,
} from '@/lib/marketplace/supplyChainTrace';
import { SupplyChainTrace } from '@/components/organisms/SupplyChainTrace';

interface TracePageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: TracePageProps): Promise<Metadata> {
  const { id } = await params;
  const trace = findCreditTrace(id);
  return {
    title: trace ? `Credit origin · ${trace.projectName}` : 'Credit origin not found',
    description: trace
      ? `Trace ${trace.issuedTonnes} t CO₂e back to ${trace.farm.name}, ${trace.farm.country}.`
      : undefined,
  };
}

/**
 * Supply chain tracing — Issue #1296
 * Refactored to utilize Atomic Design organism
 */
export default async function CreditTracePage({ params }: TracePageProps) {
  const { id } = await params;

  // Data Fetching logic strictly remains in the page.tsx
  const found = findCreditTrace(id);
  if (!found) notFound();

  const trace = toPublicTrace(found);
  const verification = verifyTrace(found);
  const summary = summarizeTrace(found);

  return (
    <main className="container mx-auto max-w-6xl px-4 py-8">
      {/* Offload the complex UI rendering to the organism */}
      <SupplyChainTrace trace={trace} verification={verification} summary={summary} found={found} />
    </main>
  );
}
