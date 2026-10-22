'use client';

import { useState, type FormEvent, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/atoms/Input';
import {
  MINIMUM_MONITORING_VISITS_PER_YEAR,
  MINIMUM_REPORTS_PER_YEAR,
  MINIMUM_SURVIVAL_RATE,
} from '@/lib/partner-certification';
import { MINIMUM_NATIVE_SPECIES_RATIO } from '@/lib/native-species';

interface FieldProps {
  id: string;
  label: string;
  hint?: string;
  children: ReactNode;
}

function Field({ id, label, hint, children }: FieldProps) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/** Certification application form for partner planting organisations. (#1691) */
export function PartnerCertificationForm() {
  const [status, setStatus] = useState<'idle' | 'submitting' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const num = (key: string) => Number(data.get(key));
    setStatus('submitting');
    setError(null);
    try {
      const response = await fetch('/api/partner-certifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          partnerId: data.get('partnerId'),
          organisationName: data.get('organisationName'),
          contactEmail: data.get('contactEmail'),
          nativeTrees: num('nativeTrees'),
          totalTrees: num('totalTrees'),
          monitoringVisitsPerYear: num('monitoringVisitsPerYear'),
          reportedSurvivalRate: num('reportedSurvivalRate'),
          reportsPerYear: num('reportsPerYear'),
          evidenceUrl: data.get('evidenceUrl'),
          attested: data.get('attested') === 'on',
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? 'Unable to submit application');
      setStatus('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to submit application');
      setStatus('idle');
    }
  }

  if (status === 'done') {
    return (
      <div role="status" className="rounded-xl border border-border bg-card p-6">
        <h2 className="text-xl font-semibold">Application submitted</h2>
        <p className="mt-2 text-muted-foreground">
          Our team will review your evidence. Once approved, the certification badge appears on your
          partner profile and projects.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" aria-label="Certification application">
      <Field id="partnerId" label="Partner ID">
        <Input id="partnerId" name="partnerId" required placeholder="partner-acme" />
      </Field>
      <Field id="organisationName" label="Organisation name">
        <Input id="organisationName" name="organisationName" required />
      </Field>
      <Field id="contactEmail" label="Contact email">
        <Input id="contactEmail" name="contactEmail" type="email" required />
      </Field>

      <fieldset className="space-y-4 rounded-xl border border-border p-4">
        <legend className="px-1 text-sm font-semibold">Species selection</legend>
        <Field
          id="nativeTrees"
          label="Native trees planted"
          hint={`At least ${MINIMUM_NATIVE_SPECIES_RATIO}% of planted trees must be native.`}
        >
          <Input id="nativeTrees" name="nativeTrees" type="number" min={0} required />
        </Field>
        <Field id="totalTrees" label="Total trees planted">
          <Input id="totalTrees" name="totalTrees" type="number" min={0} required />
        </Field>
      </fieldset>

      <fieldset className="space-y-4 rounded-xl border border-border p-4">
        <legend className="px-1 text-sm font-semibold">Survival monitoring</legend>
        <Field
          id="monitoringVisitsPerYear"
          label="Monitoring visits per year"
          hint={`Minimum ${MINIMUM_MONITORING_VISITS_PER_YEAR}.`}
        >
          <Input
            id="monitoringVisitsPerYear"
            name="monitoringVisitsPerYear"
            type="number"
            min={0}
            required
          />
        </Field>
        <Field
          id="reportedSurvivalRate"
          label="Survival rate at last check (%)"
          hint={`Minimum ${MINIMUM_SURVIVAL_RATE}%.`}
        >
          <Input
            id="reportedSurvivalRate"
            name="reportedSurvivalRate"
            type="number"
            min={0}
            max={100}
            required
          />
        </Field>
      </fieldset>

      <fieldset className="space-y-4 rounded-xl border border-border p-4">
        <legend className="px-1 text-sm font-semibold">Reporting</legend>
        <Field
          id="reportsPerYear"
          label="Progress reports per year"
          hint={`Minimum ${MINIMUM_REPORTS_PER_YEAR}.`}
        >
          <Input id="reportsPerYear" name="reportsPerYear" type="number" min={0} required />
        </Field>
        <Field id="evidenceUrl" label="Link to supporting documents">
          <Input id="evidenceUrl" name="evidenceUrl" type="url" required placeholder="https://" />
        </Field>
      </fieldset>

      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="attested" required className="mt-1" />
        <span>I confirm that the information provided is accurate and can be audited.</span>
      </label>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <Button type="submit" disabled={status === 'submitting'}>
        {status === 'submitting' ? 'Submitting…' : 'Submit application'}
      </Button>
    </form>
  );
}
