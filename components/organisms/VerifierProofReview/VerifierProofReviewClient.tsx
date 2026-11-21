'use client';

/**
 * Client wrapper for the VerifierProofReview organism.
 *
 * Handles:
 *  - Loading the mock queue (swap for a real API call / React Query fetch here)
 *  - Optimistic decision state updates so the UI reflects decisions immediately
 *  - Simulated async submission with loading state
 */

import { useCallback, useState } from 'react';
import { mockProofReviewQueue } from '@/lib/api/mock/proofReviewQueue';
import {
  VerifierProofReview,
  type PhotoEvidence,
  type VerificationDecision,
} from './VerifierProofReview';

export function VerifierProofReviewClient() {
  const [queue, setQueue] = useState<PhotoEvidence[]>(mockProofReviewQueue);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleDecision = useCallback(
    async (evidenceId: string, decision: Exclude<VerificationDecision, null>, notes: string) => {
      setIsSubmitting(true);

      // Simulate network round-trip; replace with real API call.
      await new Promise<void>((resolve) => setTimeout(resolve, 800));

      setQueue((prev) =>
        prev.map((item) =>
          item.id === evidenceId ? { ...item, current_decision: decision } : item
        )
      );

      setIsSubmitting(false);

      // In production: toast notification, re-query, etc.
      console.info(`Decision recorded — id=${evidenceId}, decision=${decision}, notes="${notes}"`);
    },
    []
  );

  return (
    <VerifierProofReview queue={queue} onDecision={handleDecision} isSubmitting={isSubmitting} />
  );
}
