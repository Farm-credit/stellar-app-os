import type { Pool, PoolClient } from 'pg';
import type { z } from 'zod';
import {
  type eventSchema,
  type signupSchema,
  type updateSchema,
  type PlantingEvent,
  type Volunteer,
} from './schema';

export class VolunteerError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
  }
}

export async function listEvents(pool: Pool): Promise<PlantingEvent[]> {
  const result = await pool.query<PlantingEvent>(
    `SELECT id, coordinator_wallet, title, location, briefing, starts_at, ends_at
     FROM planting_events ORDER BY starts_at DESC, id LIMIT 100`
  );
  return result.rows;
}

export async function createEvent(pool: Pool, wallet: string, input: z.infer<typeof eventSchema>) {
  if (Date.parse(input.startsAt) <= Date.now())
    throw new VolunteerError('Choose a future start time', 400);
  const result = await pool.query<PlantingEvent>(
    `INSERT INTO planting_events (coordinator_wallet, title, location, briefing, starts_at, ends_at)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [wallet, input.title, input.location, input.briefing, input.startsAt, input.endsAt]
  );
  return result.rows[0];
}

async function findEvent(client: Pool | PoolClient, id: string, lock = false) {
  const result = await client.query<PlantingEvent>(
    `SELECT * FROM planting_events WHERE id = $1${lock ? ' FOR UPDATE' : ''}`,
    [id]
  );
  if (!result.rows[0]) throw new VolunteerError('Event not found', 404);
  return result.rows[0];
}

export async function getEvent(pool: Pool, id: string, wallet: string) {
  const event = await findEvent(pool, id);
  const result = await pool.query<Volunteer>(
    `SELECT id, event_id, wallet, name, email, role, minutes, briefing_sent_at
     FROM planting_event_volunteers WHERE event_id = $1 AND ($2 = $3 OR wallet = $2)
     ORDER BY created_at, id`,
    [id, wallet, event.coordinator_wallet]
  );
  return { event, volunteers: result.rows };
}

export async function signup(
  pool: Pool,
  id: string,
  wallet: string,
  input: z.infer<typeof signupSchema>
) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const event = await findEvent(client, id, true);
    if (new Date(event.starts_at).getTime() <= Date.now())
      throw new VolunteerError('Sign-up has closed', 409);
    const result = await client.query<Volunteer>(
      `INSERT INTO planting_event_volunteers (event_id, wallet, name, email, role)
       VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING
       RETURNING id, event_id, wallet, name, email, role, minutes, briefing_sent_at`,
      [id, wallet, input.name, input.email, input.role]
    );
    if (!result.rows[0])
      throw new VolunteerError('This wallet or email is already registered', 409);
    await client.query('COMMIT');
    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function updateVolunteer(
  pool: Pool,
  id: string,
  wallet: string,
  input: z.infer<typeof updateSchema>
) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const event = await findEvent(client, id, true);
    const result = await client.query<
      Volunteer & { briefing_lease: string | null; briefing_retry_at: Date }
    >('SELECT * FROM planting_event_volunteers WHERE event_id = $1 AND id = $2 FOR UPDATE', [
      id,
      input.volunteerId,
    ]);
    const volunteer = result.rows[0];
    if (!volunteer) throw new VolunteerError('Volunteer not found', 404);
    if (input.action === 'role') {
      if (event.coordinator_wallet !== wallet)
        throw new VolunteerError('Only the coordinator can assign roles', 403);
      if (new Date(event.starts_at).getTime() <= Date.now())
        throw new VolunteerError('Roles are locked after the event starts', 409);
      if (
        volunteer.briefing_lease &&
        new Date(volunteer.briefing_retry_at).getTime() > Date.now()
      ) {
        throw new VolunteerError(
          'A briefing is being delivered; retry the role change shortly',
          409
        );
      }
      if (volunteer.role !== input.role)
        await client.query(
          `UPDATE planting_event_volunteers SET role = $3, briefing_sent_at = NULL,
         briefing_attempts = 0, briefing_lease = NULL, briefing_retry_at = now()
         WHERE event_id = $1 AND id = $2`,
          [id, input.volunteerId, input.role]
        );
    } else {
      if (volunteer.wallet !== wallet && event.coordinator_wallet !== wallet)
        throw new VolunteerError('You cannot log hours for this volunteer', 403);
      if (new Date(event.ends_at).getTime() > Date.now())
        throw new VolunteerError('Log hours after the event ends', 409);
      const duration =
        (new Date(event.ends_at).getTime() - new Date(event.starts_at).getTime()) / 60000;
      if (input.minutes > duration)
        throw new VolunteerError('Hours cannot exceed the event duration', 400);
      await client.query(
        `UPDATE planting_event_volunteers SET minutes = $3, hours_logged_at = now()
         WHERE event_id = $1 AND id = $2`,
        [id, input.volunteerId, input.minutes]
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
