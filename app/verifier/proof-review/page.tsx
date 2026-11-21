import type { Metadata } from 'next';
import { VerifierProofReviewClient } from '@/components/organisms/VerifierProofReview/VerifierProofReviewClient';

export const metadata: Metadata = {
  title: 'Proof Review | Verifier Dashboard',
  description:
    'Compare satellite baseline images against planter-submitted photos and issue verification decisions.',
};

/**
 * /verifier/proof-review
 *
 * Server component shell — delegates interactive state to the client wrapper.
 */
export default function VerifierProofReviewPage() {
  return (
    <main className="min-h-screen bg-background px-4 pb-16 pt-20 sm:px-6 lg:px-8">
      <header className="mb-8 space-y-1">
        <h1 className="text-3xl font-semibold tracking-tight">Verifier Proof Review</h1>
        <p className="text-sm text-muted-foreground">
          Compare satellite baseline photos against planter-submitted evidence and record your
          verification decision.
        </p>
      </header>
      <VerifierProofReviewClient />
    </main>
  );
}
