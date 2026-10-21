'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { VOLUNTEER_ROLES, type PlantingEvent, type Volunteer } from '@/lib/volunteers/schema';

const field = 'w-full rounded-lg border border-gray-300 bg-white p-3 text-gray-900';
const button = 'rounded-lg bg-stellar-purple px-4 py-2 font-medium text-white disabled:opacity-50';
async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/planting/events${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data as T;
}
function date(value: string) {
  return new Date(value).toLocaleString();
}
function roleLabel(value: string) {
  return value === 'team-lead' ? 'Team lead' : value.charAt(0).toUpperCase() + value.slice(1);
}

export function VolunteerCoordination() {
  const [events, setEvents] = useState<PlantingEvent[]>([]);
  const [wallet, setWallet] = useState('');
  const [selected, setSelected] = useState<PlantingEvent | null>(null);
  const [volunteers, setVolunteers] = useState<Volunteer[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    api<{ events: PlantingEvent[] }>('')
      .then((data) => setEvents(data.events))
      .catch((error: Error) => setError(error.message));
    api<{ wallet: string }>('/session')
      .then((data) => setWallet(data.wallet))
      .catch(() => {});
  }, []);

  async function act(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Please try again');
    } finally {
      setBusy(false);
    }
  }
  async function loadEvent(id: string) {
    const data = await api<{ event: PlantingEvent; volunteers: Volunteer[] }>(`/${id}`);
    setSelected(data.event);
    setVolunteers(data.volunteers);
    setCreating(false);
  }
  async function signIn() {
    const { requestAccess, signMessage } = await import('@stellar/freighter-api');
    const access = await requestAccess();
    if (access.error || !access.address)
      throw new Error('Connect your Freighter wallet to sign in');
    const challenge = await api<{ nonce: string; message: string }>(
      `/session?wallet=${encodeURIComponent(access.address)}`
    );
    const signed = await signMessage(challenge.message, { address: access.address });
    if (signed.error || !signed.signedMessage)
      throw new Error('Please approve the sign-in message in Freighter');
    const session = await api<{ wallet: string }>('/session', {
      method: 'POST',
      body: JSON.stringify({
        wallet: access.address,
        nonce: challenge.nonce,
        signature:
          typeof signed.signedMessage === 'string'
            ? signed.signedMessage
            : signed.signedMessage.toString('base64'),
      }),
    });
    setWallet(session.wallet);
    setNotice('Signed in. Choose an event to join or coordinate.');
  }
  const coordinator = Boolean(wallet && selected?.coordinator_wallet === wallet);
  const own = volunteers.find((volunteer) => volunteer.wallet === wallet);
  const ended = Boolean(selected && new Date(selected.ends_at).getTime() <= Date.now());
  const started = Boolean(selected && new Date(selected.starts_at).getTime() <= Date.now());

  function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void act(async () => {
      const data = await api<{ event: PlantingEvent }>('', {
        method: 'POST',
        body: JSON.stringify({
          title: form.get('title'),
          location: form.get('location'),
          briefing: form.get('briefing'),
          startsAt: new Date(String(form.get('startsAt'))).toISOString(),
          endsAt: new Date(String(form.get('endsAt'))).toISOString(),
        }),
      });
      setEvents((previous) => [data.event, ...previous]);
      await loadEvent(data.event.id);
      setNotice('Event created. Share this page and the event name with volunteers.');
    });
  }
  function join(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (!selected) return;
    void act(async () => {
      await api(`/${selected.id}`, {
        method: 'POST',
        body: JSON.stringify(Object.fromEntries(form)),
      });
      await loadEvent(selected.id);
      setNotice('You are signed up. Your briefing will arrive by email before the event.');
    });
  }
  async function update(input: Record<string, unknown>) {
    if (!selected) return;
    await api(`/${selected.id}`, { method: 'PATCH', body: JSON.stringify(input) });
    await loadEvent(selected.id);
    setNotice('Volunteer record updated.');
  }

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-semibold text-stellar-purple">Grow together</p>
          <h1 className="text-3xl font-bold">Planting events</h1>
          <p className="mt-2 text-gray-600">
            Join a crew, prepare for planting day, and record your contribution.
          </p>
        </div>
        <div className="flex gap-3">
          {wallet ? (
            <>
              <button
                className={button}
                disabled={busy}
                onClick={() => {
                  setCreating(true);
                  setSelected(null);
                }}
              >
                Create event
              </button>
              <button
                className="underline"
                disabled={busy}
                onClick={() =>
                  void act(async () => {
                    await api('/session', { method: 'DELETE' });
                    setWallet('');
                    setSelected(null);
                    setVolunteers([]);
                    setCreating(false);
                  })
                }
              >
                Sign out
              </button>
            </>
          ) : (
            <button className={button} disabled={busy} onClick={() => void act(signIn)}>
              Sign in with Freighter
            </button>
          )}
        </div>
      </header>
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 p-4 text-red-800">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-lg bg-green-50 p-4 text-green-800">
          {notice}
        </p>
      )}
      {busy && <p role="status">Saving or loading…</p>}
      <div className="grid gap-6 md:grid-cols-[minmax(220px,1fr)_2fr]">
        <section aria-label="Events" className="space-y-3">
          {events.length === 0 && <p>No events yet. Sign in to organize the first planting day.</p>}
          {events.map((event) => (
            <button
              key={event.id}
              disabled={busy || !wallet}
              onClick={() => void act(() => loadEvent(event.id))}
              className="w-full rounded-xl border p-4 text-left hover:border-stellar-purple disabled:cursor-default"
            >
              <h2 className="font-bold">{event.title}</h2>
              <p>{event.location}</p>
              <p className="mt-2 text-sm text-gray-600">{date(event.starts_at)}</p>
              <p className="text-sm text-stellar-purple">
                {event.coordinator_wallet === wallet
                  ? 'You coordinate this event'
                  : wallet
                    ? 'View and join'
                    : 'Sign in to join'}
              </p>
            </button>
          ))}
        </section>
        <section className="rounded-xl border p-5" aria-label="Event details">
          {creating ? (
            <form onSubmit={create} className="space-y-4">
              <h2 className="text-xl font-bold">Organize a planting event</h2>
              <label className="block">
                Event name
                <input className={field} name="title" required maxLength={120} />
              </label>
              <label className="block">
                Meeting location
                <input className={field} name="location" required maxLength={300} />
              </label>
              <label className="block">
                Starts (your local time)
                <input className={field} name="startsAt" type="datetime-local" required />
              </label>
              <label className="block">
                Ends (your local time)
                <input className={field} name="endsAt" type="datetime-local" required />
              </label>
              <label className="block">
                Volunteer briefing
                <textarea
                  className={field}
                  name="briefing"
                  required
                  maxLength={5000}
                  rows={5}
                  placeholder="Meeting point, what to bring, safety instructions, and coordinator contact"
                />
              </label>
              <p className="text-sm text-gray-600">
                Volunteers can join as diggers, photographers, or team leads. You can adjust
                assignments before the event. Briefings are emailed within 24 hours of the start.
              </p>
              <button className={button} disabled={busy}>
                Create event
              </button>
            </form>
          ) : selected ? (
            <div className="space-y-5">
              <div>
                <h2 className="text-2xl font-bold">{selected.title}</h2>
                <p>{selected.location}</p>
                <p>
                  {date(selected.starts_at)} – {date(selected.ends_at)}
                </p>
              </div>
              <div>
                <h3 className="font-semibold">Planting-day briefing</h3>
                <p className="whitespace-pre-wrap">{selected.briefing}</p>
              </div>
              {!own && !started && (
                <form onSubmit={join} className="space-y-3">
                  <h3 className="font-bold">Join this event</h3>
                  <label className="block">
                    Your name
                    <input className={field} name="name" required maxLength={100} />
                  </label>
                  <label className="block">
                    Briefing email
                    <input className={field} name="email" type="email" required maxLength={254} />
                  </label>
                  <label className="block">
                    Preferred role
                    <select className={field} name="role">
                      {VOLUNTEER_ROLES.map((role) => (
                        <option key={role} value={role}>
                          {roleLabel(role)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p className="text-sm">
                    Your contact details are visible only to you and this event’s coordinator.
                  </p>
                  <button disabled={busy} className={button}>
                    Sign up
                  </button>
                </form>
              )}
              {started && !own && <p>Sign-up has closed for this event.</p>}
              <h3 className="font-bold">
                {coordinator ? `Volunteer roster (${volunteers.length})` : 'Your registration'}
              </h3>
              {volunteers.map((volunteer) => (
                <div className="space-y-2 rounded-lg border p-4" key={volunteer.id}>
                  <p className="font-semibold">{volunteer.name}</p>
                  <p className="break-all text-sm">{volunteer.email}</p>
                  {coordinator && !started ? (
                    <label className="block">
                      Assigned role for {volunteer.name}
                      <select
                        className={field}
                        value={volunteer.role}
                        disabled={busy}
                        onChange={(event) =>
                          void act(() =>
                            update({
                              action: 'role',
                              volunteerId: volunteer.id,
                              role: event.target.value,
                            })
                          )
                        }
                      >
                        {VOLUNTEER_ROLES.map((role) => (
                          <option key={role} value={role}>
                            {roleLabel(role)}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <p>{roleLabel(volunteer.role)}</p>
                  )}
                  <p className="text-sm">
                    {volunteer.briefing_sent_at
                      ? 'Briefing sent'
                      : started
                        ? 'Briefing delivery window closed'
                        : 'Briefing scheduled before the event'}
                  </p>
                  <p>
                    Hours contributed:{' '}
                    {volunteer.minutes === null
                      ? 'Not logged'
                      : (volunteer.minutes / 60).toFixed(2)}
                  </p>
                  {ended ? (
                    <form
                      className="flex flex-wrap items-end gap-2"
                      onSubmit={(event) => {
                        event.preventDefault();
                        const form = new FormData(event.currentTarget);
                        void act(() =>
                          update({
                            action: 'hours',
                            volunteerId: volunteer.id,
                            minutes: Number(form.get('minutes')),
                          })
                        );
                      }}
                    >
                      <label>
                        Minutes volunteered
                        <input
                          className={field}
                          name="minutes"
                          type="number"
                          min="1"
                          max={Math.floor(
                            (Date.parse(selected.ends_at) - Date.parse(selected.starts_at)) / 60000
                          )}
                          step="1"
                          required
                          defaultValue={volunteer.minutes ?? ''}
                        />
                      </label>
                      <button disabled={busy} className={button}>
                        Save hours
                      </button>
                    </form>
                  ) : (
                    <p className="text-sm text-gray-600">
                      Hours logging opens after the event ends.
                    </p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p>Choose an event to view its briefing, join the crew, or manage volunteer roles.</p>
          )}
        </section>
      </div>
    </main>
  );
}
