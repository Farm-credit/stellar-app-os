'use client';

/**
 * WildlifeSightingLog — Issue #1665
 *
 * Submission tool for the wildlife sighting log: field teams and approved
 * citizen scientists submit sightings, and reviewers approve or reject
 * citizen-scientist entries before they count toward the habitat quality
 * score shown on the project page.
 */

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Bird, CheckCircle2, XCircle } from 'lucide-react';

import { mockAdminProjectDetails } from '@/lib/api/mock/adminProjectDetails';
import type { WildlifeSighting } from '@/lib/wildlife/types';
import { SUBMITTER_ROLES, TAXONOMIC_GROUPS } from '@/lib/wildlife/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

interface Feedback {
  type: 'success' | 'error';
  message: string;
}

const STATUS_STYLES: Record<WildlifeSighting['status'], string> = {
  approved: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  pending: 'border-amber-200 bg-amber-50 text-amber-700',
  rejected: 'border-red-200 bg-red-50 text-red-700',
};

const PROJECT_NAME = new Map(mockAdminProjectDetails.map((project) => [project.id, project.name]));

function projectLabel(projectId: string): string {
  return PROJECT_NAME.get(projectId) ?? projectId;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

const EMPTY_FORM = {
  projectId: mockAdminProjectDetails[0]?.id ?? '',
  speciesCommonName: '',
  scientificName: '',
  taxonomicGroup: 'bird',
  count: '1',
  observedDate: '',
  submittedBy: '',
  submitterRole: 'field_team',
  photoUrl: '',
  notes: '',
};

export function WildlifeSightingLog() {
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [sightings, setSightings] = useState<WildlifeSighting[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [reviewerName, setReviewerName] = useState('Field Supervisor');

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/wildlife/sightings');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = (await response.json()) as { sightings?: WildlifeSighting[] };
      setSightings(Array.isArray(data.sightings) ? data.sightings : []);
    } catch {
      setFeedback({ type: 'error', message: 'Could not load the sighting log.' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function updateField(field: keyof typeof EMPTY_FORM, value: string): void {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setFeedback(null);

    if (!form.speciesCommonName.trim() || !form.submittedBy.trim() || !form.observedDate) {
      setFeedback({
        type: 'error',
        message: 'Species, observer name and observation date are required.',
      });
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch('/api/wildlife/sightings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: form.projectId,
          speciesCommonName: form.speciesCommonName,
          scientificName: form.scientificName || undefined,
          taxonomicGroup: form.taxonomicGroup,
          count: Number(form.count),
          observedAt: `${form.observedDate}T12:00:00.000Z`,
          submittedBy: form.submittedBy,
          submitterRole: form.submitterRole,
          photoUrl: form.photoUrl || undefined,
          notes: form.notes || undefined,
        }),
      });

      const data = (await response.json()) as {
        error?: string;
        requiresApproval?: boolean;
      };

      if (!response.ok) {
        setFeedback({ type: 'error', message: data.error ?? 'Submission failed.' });
        return;
      }

      setFeedback({
        type: 'success',
        message: data.requiresApproval
          ? 'Sighting submitted — pending reviewer approval before it counts toward the habitat score.'
          : 'Sighting submitted and approved automatically (field-team record).',
      });
      setForm((current) => ({
        ...current,
        speciesCommonName: '',
        scientificName: '',
        count: '1',
        photoUrl: '',
        notes: '',
      }));
      await load();
    } catch {
      setFeedback({ type: 'error', message: 'Submission failed — please retry.' });
    } finally {
      setSubmitting(false);
    }
  }

  async function review(sightingId: string, decision: 'approve' | 'reject'): Promise<void> {
    setFeedback(null);
    try {
      const response = await fetch(
        `/api/wildlife/sightings/${encodeURIComponent(sightingId)}/review`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ decision, reviewer: reviewerName }),
        }
      );
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setFeedback({ type: 'error', message: data.error ?? 'Review failed.' });
        return;
      }
      setFeedback({
        type: 'success',
        message: decision === 'approve' ? 'Sighting approved.' : 'Sighting rejected.',
      });
      await load();
    } catch {
      setFeedback({ type: 'error', message: 'Review failed — please retry.' });
    }
  }

  const pending = sightings.filter((sighting) => sighting.status === 'pending');

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <header className="space-y-2">
        <h1 className="flex items-center gap-2 text-3xl font-bold text-foreground">
          <Bird className="h-7 w-7 text-stellar-green" aria-hidden />
          Wildlife Sighting Log
        </h1>
        <p className="text-muted-foreground">
          Submit wildlife sightings from the field. Citizen-scientist records are reviewed before
          they count toward the project&apos;s habitat quality score.
        </p>
      </header>

      {feedback && (
        <div
          role={feedback.type === 'error' ? 'alert' : 'status'}
          className={`flex items-start gap-2 rounded-lg border px-4 py-3 text-sm ${
            feedback.type === 'error'
              ? 'border-red-300 bg-red-50 text-red-800'
              : 'border-emerald-300 bg-emerald-50 text-emerald-800'
          }`}
        >
          {feedback.type === 'error' ? (
            <XCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          ) : (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          )}
          <p>{feedback.message}</p>
        </div>
      )}

      {/* ── Submission form ── */}
      <form
        onSubmit={handleSubmit}
        className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-sm"
      >
        <h2 className="text-lg font-semibold">New sighting</h2>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="wildlife-project">Project</Label>
            <select
              id="wildlife-project"
              value={form.projectId}
              onChange={(event) => updateField('projectId', event.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {mockAdminProjectDetails.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="wildlife-species">Species (common name)</Label>
            <Input
              id="wildlife-species"
              value={form.speciesCommonName}
              onChange={(event) => updateField('speciesCommonName', event.target.value)}
              placeholder="e.g. African Grey Parrot"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="wildlife-scientific">Scientific name (optional)</Label>
            <Input
              id="wildlife-scientific"
              value={form.scientificName}
              onChange={(event) => updateField('scientificName', event.target.value)}
              placeholder="e.g. Psittacus erithacus"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="wildlife-group">Taxonomic group</Label>
            <select
              id="wildlife-group"
              value={form.taxonomicGroup}
              onChange={(event) => updateField('taxonomicGroup', event.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {TAXONOMIC_GROUPS.map((group) => (
                <option key={group} value={group}>
                  {group}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="wildlife-count">Individuals observed</Label>
            <Input
              id="wildlife-count"
              type="number"
              min={1}
              max={1000}
              value={form.count}
              onChange={(event) => updateField('count', event.target.value)}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="wildlife-date">Observation date</Label>
            <Input
              id="wildlife-date"
              type="date"
              value={form.observedDate}
              onChange={(event) => updateField('observedDate', event.target.value)}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="wildlife-observer">Observed by</Label>
            <Input
              id="wildlife-observer"
              value={form.submittedBy}
              onChange={(event) => updateField('submittedBy', event.target.value)}
              placeholder="Your name or team"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="wildlife-role">Submitter type</Label>
            <select
              id="wildlife-role"
              value={form.submitterRole}
              onChange={(event) => updateField('submitterRole', event.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {SUBMITTER_ROLES.map((role) => (
                <option key={role} value={role}>
                  {role === 'field_team' ? 'Field team' : 'Citizen scientist'}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="wildlife-photo">Photo URL (optional)</Label>
            <Input
              id="wildlife-photo"
              value={form.photoUrl}
              onChange={(event) => updateField('photoUrl', event.target.value)}
              placeholder="https://…"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="wildlife-notes">Notes (optional)</Label>
          <Textarea
            id="wildlife-notes"
            value={form.notes}
            onChange={(event) => updateField('notes', event.target.value)}
            rows={2}
            placeholder="Behaviour, habitat, conditions…"
          />
        </div>

        <Button type="submit" disabled={submitting}>
          {submitting ? 'Submitting…' : 'Submit sighting'}
        </Button>
      </form>

      {/* ── Review queue ── */}
      <section className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">
            Pending review{' '}
            <span className="text-sm font-normal text-muted-foreground">({pending.length})</span>
          </h2>
          <div className="flex items-center gap-2">
            <Label htmlFor="wildlife-reviewer" className="text-xs text-muted-foreground">
              Reviewer
            </Label>
            <Input
              id="wildlife-reviewer"
              value={reviewerName}
              onChange={(event) => setReviewerName(event.target.value)}
              className="h-8 w-48"
            />
          </div>
        </div>

        {pending.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing awaiting review.</p>
        ) : (
          <ul className="divide-y divide-border">
            {pending.map((sighting) => (
              <li
                key={sighting.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div className="text-sm">
                  <p className="font-medium">
                    {sighting.speciesCommonName}{' '}
                    <span className="font-normal text-muted-foreground">
                      · {sighting.count} observed · {formatDate(sighting.observedAt)}
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {projectLabel(sighting.projectId)} · by {sighting.submittedBy} (
                    {sighting.submitterRole === 'field_team' ? 'field team' : 'citizen scientist'})
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void review(sighting.id, 'approve')}
                  >
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => void review(sighting.id, 'reject')}
                  >
                    Reject
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Full log ── */}
      <section className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-sm">
        <h2 className="text-lg font-semibold">
          Sighting log{' '}
          <span className="text-sm font-normal text-muted-foreground">({sightings.length})</span>
        </h2>

        {loading ? (
          <div className="h-32 animate-pulse rounded-lg bg-muted" />
        ) : sightings.length === 0 ? (
          <p className="text-sm text-muted-foreground">No sightings recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">Species</th>
                  <th className="py-2 pr-4 font-medium">Project</th>
                  <th className="py-2 pr-4 font-medium">Count</th>
                  <th className="py-2 pr-4 font-medium">Observed</th>
                  <th className="py-2 pr-4 font-medium">Submitted by</th>
                  <th className="py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sightings.map((sighting) => (
                  <tr key={sighting.id}>
                    <td className="py-2 pr-4">
                      {sighting.speciesCommonName}
                      <span className="block text-xs text-muted-foreground">
                        {sighting.taxonomicGroup}
                      </span>
                    </td>
                    <td className="py-2 pr-4">{projectLabel(sighting.projectId)}</td>
                    <td className="py-2 pr-4">{sighting.count}</td>
                    <td className="py-2 pr-4">{formatDate(sighting.observedAt)}</td>
                    <td className="py-2 pr-4">
                      {sighting.submittedBy}
                      <span className="block text-xs text-muted-foreground">
                        {sighting.submitterRole === 'field_team'
                          ? 'field team'
                          : 'citizen scientist'}
                      </span>
                    </td>
                    <td className="py-2">
                      <span
                        className={`inline-block rounded-full border px-2 py-0.5 text-xs ${STATUS_STYLES[sighting.status]}`}
                      >
                        {sighting.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
