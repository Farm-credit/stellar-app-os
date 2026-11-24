'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { CertificationApplication } from '@/lib/partner-certification';

/** Admin review queue for partner certification applications. (#1691) */
export function PartnerCertificationReviewPanel() {
  const [applications, setApplications] = useState<CertificationApplication[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch('/api/admin/partner-certifications');
    if (!response.ok) {
      setError('Unable to load applications');
      return;
    }
    const payload = (await response.json()) as { applications: CertificationApplication[] };
    setApplications(payload.applications);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function decide(id: string, decision: 'approve' | 'reject') {
    setError(null);
    const response = await fetch(`/api/admin/partner-certifications/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision, note: notes[id] ?? '' }),
    });
    if (!response.ok) {
      const payload = (await response.json()) as { error?: string };
      setError(payload.error ?? 'Unable to save decision');
      return;
    }
    await load();
  }

  return (
    <div className="space-y-4">
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {applications.length === 0 ? (
        <p className="text-sm text-muted-foreground">No applications yet.</p>
      ) : null}
      {applications.map((application) => (
        <article
          key={application.id}
          className="rounded-xl border border-border bg-card p-5"
          data-testid={`certification-${application.id}`}
        >
          <header className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-lg font-semibold">{application.organisationName}</h3>
            <span className="text-sm capitalize text-muted-foreground">{application.status}</span>
          </header>
          <p className="text-sm text-muted-foreground">
            {application.partnerId} · {application.contactEmail} ·{' '}
            <a
              href={application.evidenceUrl}
              className="text-stellar-blue hover:underline"
              target="_blank"
              rel="noreferrer"
            >
              Evidence
            </a>
          </p>
          <ul className="mt-3 space-y-1 text-sm">
            {application.checks.map((check) => (
              <li key={check.standard}>
                {check.passed ? '✅' : '❌'} <strong>{check.label}:</strong> {check.detail}
              </li>
            ))}
          </ul>
          {application.status === 'submitted' ? (
            <div className="mt-4 space-y-2">
              <textarea
                aria-label={`Review note for ${application.organisationName}`}
                className="w-full rounded-lg border border-input bg-background p-2 text-sm"
                rows={2}
                placeholder="Review note (required to reject)"
                value={notes[application.id] ?? ''}
                onChange={(event) =>
                  setNotes((current) => ({ ...current, [application.id]: event.target.value }))
                }
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={() => void decide(application.id, 'approve')}>
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void decide(application.id, 'reject')}
                >
                  Reject
                </Button>
              </div>
            </div>
          ) : application.reviewerNote ? (
            <p className="mt-3 text-sm text-muted-foreground">Note: {application.reviewerNote}</p>
          ) : null}
        </article>
      ))}
    </div>
  );
}
