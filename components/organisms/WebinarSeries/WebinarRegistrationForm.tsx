'use client';

import { useState, type FormEvent } from 'react';
import { CheckCircle2, Clock } from 'lucide-react';
import { validateWebinarRegistration } from '@/lib/webinars';

export interface WebinarRegistrationFormProps {
  slug: string;
  title: string;
  /** Whether the session is already full, so sign-ups join the waitlist. */
  isFull: boolean;
}

type FormState =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'done'; status: 'registered' | 'waitlisted' }
  | { kind: 'error'; messages: string[] };

const inputClass =
  'mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stellar-blue';

/** Sign-up form for one upcoming session (register or join the waitlist). */
export function WebinarRegistrationForm({ slug, title, isFull }: WebinarRegistrationFormProps) {
  const [state, setState] = useState<FormState>({ kind: 'idle' });

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const parsed = validateWebinarRegistration({
      name: form.get('name'),
      email: form.get('email'),
      location: form.get('location'),
    });
    if (!parsed.ok) {
      setState({ kind: 'error', messages: parsed.errors });
      return;
    }

    setState({ kind: 'submitting' });
    try {
      const res = await fetch(`/api/v2/webinars/${encodeURIComponent(slug)}/registrations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
      });
      const data = await res.json();
      if (!res.ok) {
        setState({
          kind: 'error',
          messages: data.details ?? [data.error ?? 'Registration failed.'],
        });
        return;
      }
      setState({ kind: 'done', status: data.registration.status });
    } catch {
      setState({ kind: 'error', messages: ['Could not reach the server. Please try again.'] });
    }
  }

  if (state.kind === 'done') {
    const waitlisted = state.status === 'waitlisted';
    const Icon = waitlisted ? Clock : CheckCircle2;
    return (
      <div
        role="status"
        className="flex items-start gap-3 rounded-2xl border border-border bg-card p-6"
      >
        <Icon className="mt-0.5 h-5 w-5 shrink-0 text-stellar-blue" aria-hidden="true" />
        <p className="text-foreground">
          {waitlisted
            ? `You're on the waitlist for ${title}. We'll email you if a seat opens up.`
            : `You're registered for ${title}. The joining link will be emailed to you.`}
        </p>
      </div>
    );
  }

  const submitting = state.kind === 'submitting';

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      aria-labelledby={`register-${slug}-heading`}
      className="rounded-2xl border border-border bg-card p-6 shadow-sm"
    >
      <h2 id={`register-${slug}-heading`} className="text-lg font-semibold text-foreground">
        {isFull ? 'Join the waitlist' : 'Register for this session'}
      </h2>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium text-foreground">
          Full name
          <input name="name" type="text" autoComplete="name" required className={inputClass} />
        </label>
        <label className="text-sm font-medium text-foreground">
          Email
          <input name="email" type="email" autoComplete="email" required className={inputClass} />
        </label>
        <label className="text-sm font-medium text-foreground sm:col-span-2">
          Farm location <span className="font-normal text-muted-foreground">(optional)</span>
          <input name="location" type="text" autoComplete="address-level2" className={inputClass} />
        </label>
      </div>

      {state.kind === 'error' && (
        <ul role="alert" className="mt-4 list-disc space-y-1 pl-5 text-sm text-red-600">
          {state.messages.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="mt-6 rounded-lg bg-stellar-blue px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-stellar-blue/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stellar-blue disabled:opacity-60"
      >
        {submitting ? 'Submitting…' : isFull ? 'Join the waitlist' : 'Register'}
      </button>
    </form>
  );
}
