import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEvent, getEvent, signup, updateVolunteer } from './service';
import { processBriefings } from './briefings';
import { eventSchema, signupSchema, updateSchema } from './schema';

// Explicit test database only: never use the application's DATABASE_URL.
const database = process.env.VOLUNTEER_TEST_DATABASE_URL;
describe.skipIf(!database)('volunteer coordination with PostgreSQL', () => {
  const schema = `volunteers_1662_${randomUUID().replaceAll('-', '')}`;
  const admin = new Pool({ connectionString: database });
  const pool = new Pool({ connectionString: database, options: `-c search_path=${schema}` });
  const coordinator = 'coordinator';
  const volunteer = 'volunteer';
  let id: string;
  const input = { name: 'Pat', email: 'pat@example.test', role: 'digger' as const };

  beforeAll(async () => {
    await admin.query(`CREATE SCHEMA ${schema}`);
    await pool.query(
      readFileSync(resolve('db/migrations/027_create_planting_event_volunteers.sql'), 'utf8')
    );
  });
  afterAll(async () => {
    await pool.end();
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  });
  beforeEach(async () => {
    await pool.query('TRUNCATE planting_events CASCADE');
    id = (
      await createEvent(pool, coordinator, {
        title: 'Community planting',
        location: 'North gate',
        briefing: 'Bring water and sturdy shoes.',
        startsAt: new Date(Date.now() + 3600000).toISOString(),
        endsAt: new Date(Date.now() + 10800000).toISOString(),
      })
    ).id;
  });

  it('persists signups and prevents duplicate wallets/emails under concurrent requests', async () => {
    const results = await Promise.allSettled([
      signup(pool, id, volunteer, input),
      signup(pool, id, volunteer, input),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    await expect(signup(pool, id, 'another-wallet', input)).rejects.toMatchObject({ status: 409 });
    expect((await getEvent(pool, id, coordinator)).volunteers).toHaveLength(1);
  });

  it('restricts roster contact details and role assignment to the correct coordinator', async () => {
    const record = await signup(pool, id, volunteer, input);
    expect((await getEvent(pool, id, 'outsider')).volunteers).toEqual([]);
    expect((await getEvent(pool, id, volunteer)).volunteers[0].email).toBe(input.email);
    await expect(
      updateVolunteer(pool, id, volunteer, {
        action: 'role',
        volunteerId: record.id,
        role: 'photographer',
      })
    ).rejects.toMatchObject({ status: 403 });
    await updateVolunteer(pool, id, coordinator, {
      action: 'role',
      volunteerId: record.id,
      role: 'team-lead',
    });
    expect((await getEvent(pool, id, volunteer)).volunteers[0].role).toBe('team-lead');
  });

  it('rejects cross-event updates and signups after the start', async () => {
    const record = await signup(pool, id, volunteer, input);
    await expect(
      updateVolunteer(pool, randomUUID(), coordinator, {
        action: 'role',
        volunteerId: record.id,
        role: 'photographer',
      })
    ).rejects.toMatchObject({ status: 404 });
    await pool.query(
      "UPDATE planting_events SET starts_at = now() - interval '1 hour' WHERE id = $1",
      [id]
    );
    await expect(
      signup(pool, id, 'late', { ...input, email: 'late@example.test' })
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      updateVolunteer(pool, id, coordinator, {
        action: 'role',
        volunteerId: record.id,
        role: 'photographer',
      })
    ).rejects.toMatchObject({ status: 409 });
  });

  it('logs and corrects hours only after the event, within its duration and for authorized users', async () => {
    const record = await signup(pool, id, volunteer, input);
    const update = { action: 'hours' as const, volunteerId: record.id, minutes: 90 };
    await expect(updateVolunteer(pool, id, volunteer, update)).rejects.toMatchObject({
      status: 409,
    });
    await pool.query(
      "UPDATE planting_events SET starts_at = now() - interval '3 hours', ends_at = now() - interval '1 hour' WHERE id = $1",
      [id]
    );
    await expect(updateVolunteer(pool, id, 'outsider', update)).rejects.toMatchObject({
      status: 403,
    });
    await expect(
      updateVolunteer(pool, id, volunteer, { ...update, minutes: 121 })
    ).rejects.toMatchObject({ status: 400 });
    await updateVolunteer(pool, id, volunteer, update);
    await updateVolunteer(pool, id, coordinator, { ...update, minutes: 100 });
    expect((await getEvent(pool, id, volunteer)).volunteers[0].minutes).toBe(100);
  });

  it('delivers one briefing across simultaneous workers and resends when the assigned role changes', async () => {
    const record = await signup(pool, id, volunteer, input);
    const send = vi.fn().mockResolvedValue(undefined);
    await Promise.all([processBriefings(pool, send), processBriefings(pool, send)]);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toMatchObject({
      role: 'digger',
      location: 'North gate',
      briefing: 'Bring water and sturdy shoes.',
    });
    await processBriefings(pool, send);
    expect(send).toHaveBeenCalledTimes(1);
    await updateVolunteer(pool, id, coordinator, {
      action: 'role',
      volunteerId: record.id,
      role: 'photographer',
    });
    await processBriefings(pool, send);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1][0].role).toBe('photographer');
  });

  it('retains failed briefings for retry, bounds attempts, and excludes events outside the delivery window', async () => {
    await signup(pool, id, volunteer, input);
    const send = vi.fn().mockRejectedValue(new Error('provider unavailable'));
    expect(await processBriefings(pool, send)).toEqual({ sent: 0, failed: 1 });
    await processBriefings(pool, send);
    expect(send).toHaveBeenCalledTimes(1);
    await pool.query('UPDATE planting_event_volunteers SET briefing_retry_at = now()');
    send.mockResolvedValue(undefined);
    expect(await processBriefings(pool, send)).toEqual({ sent: 1, failed: 0 });
    await pool.query(
      'UPDATE planting_event_volunteers SET briefing_sent_at = NULL, briefing_attempts = 5, briefing_retry_at = now()'
    );
    await processBriefings(pool, send);
    expect(send).toHaveBeenCalledTimes(2);
    await pool.query('UPDATE planting_event_volunteers SET briefing_attempts = 0');
    await pool.query(
      "UPDATE planting_events SET starts_at = now() + interval '2 days', ends_at = now() + interval '2 days 2 hours'"
    );
    await processBriefings(pool, send);
    await pool.query(
      "UPDATE planting_events SET starts_at = now() - interval '2 hours', ends_at = now() - interval '1 hour'"
    );
    await processBriefings(pool, send);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('recovers expired leases and prevents role edits during active delivery', async () => {
    const record = await signup(pool, id, volunteer, input);
    await pool.query(
      "UPDATE planting_event_volunteers SET briefing_lease = $1, briefing_retry_at = now() + interval '15 minutes'",
      [randomUUID()]
    );
    await expect(
      updateVolunteer(pool, id, coordinator, {
        action: 'role',
        volunteerId: record.id,
        role: 'photographer',
      })
    ).rejects.toMatchObject({ status: 409 });
    const send = vi.fn().mockResolvedValue(undefined);
    await processBriefings(pool, send);
    expect(send).not.toHaveBeenCalled();
    await pool.query(
      "UPDATE planting_event_volunteers SET briefing_retry_at = now() - interval '1 minute'"
    );
    expect(await processBriefings(pool, send)).toEqual({ sent: 1, failed: 0 });
  });
});

describe('volunteer input validation', () => {
  it('rejects invalid roles, addresses, fractional/negative minutes and event times', () => {
    expect(signupSchema.safeParse({ name: 'Pat', email: 'bad', role: 'digger' }).success).toBe(
      false
    );
    expect(
      signupSchema.safeParse({ name: 'Pat', email: 'pat@example.test', role: 'admin' }).success
    ).toBe(false);
    for (const minutes of [-1, 0, 1.5, 1441])
      expect(
        updateSchema.safeParse({ action: 'hours', volunteerId: randomUUID(), minutes }).success
      ).toBe(false);
    expect(
      eventSchema.safeParse({
        title: 'Event',
        location: 'Park',
        briefing: 'Bring water',
        startsAt: '2026-10-22T10:00:00Z',
        endsAt: '2026-10-22T09:00:00Z',
      }).success
    ).toBe(false);
  });
});
