# Planting-event volunteer coordination

Open `/planting/events` and sign in with Freighter. Signing the displayed message proves wallet ownership; no transaction or payment is submitted. Any signed-in participant can create an event and becomes its coordinator.

## Planting-day workflow

1. Create an event with a future start/end time, meeting location, and briefing. Include what to bring, safety instructions, and a contact in the briefing. Events last one minute to 24 hours; times entered in the browser are local and stored in UTC.
2. Volunteers select the event and register their name, email, and preferred role: digger, photographer, or team lead. One wallet and one email may register once per event.
3. The coordinator sees that event's roster and can assign roles until the start. Other volunteers see only their own registration and contact details. Public event listings contain no volunteer contact details; event logistics are public.
4. The email worker sends the event's logistics, assigned role, location, and UTC start/end times in the 24 hours before the start. Late signups within that window are included on the next run. A role change queues an updated briefing; edits briefly return a conflict while a delivery lease is active.
5. After the event ends, volunteers or the coordinator record total minutes contributed. Saving again corrects the total rather than adding it twice. Time must be a positive whole number of minutes no greater than the event's duration.

## Deployment

- Apply `db/migrations/027_create_planting_event_volunteers.sql` through `pnpm db:migrate` after the existing migrations. No existing schema is changed.
- Configure `DATABASE_URL`, a strong `JWT_SECRET`, `SENDGRID_API_KEY`, and `SENDGRID_FROM_EMAIL` using the existing environment settings. Do not expose these as `NEXT_PUBLIC_*` values.
- Run `pnpm email:volunteers` as a supervised worker process. It runs every five minutes. Alternatively schedule `pnpm email:volunteers:once` every five minutes through your deployment scheduler. Merely running the web server does not start this worker.
- Missing email configuration fails the worker without marking any messages delivered. Failures retry after five minutes, up to five attempts. Leases expire after fifteen minutes if a worker crashes. Messages are never newly claimed after the event starts.
- A database lease prevents simultaneous normal deliveries across replicas. Delivery is **at least once**, not exactly once: if the provider accepts an email and the process dies before saving the acknowledgement, a later retry can send a duplicate. Monitor worker failures and unacknowledged registrations with five attempts; reset attempts only after investigating the provider failure and only before the event starts.
- Database tables are server-only, with no PUBLIC grants. Use a least-privilege application role with table SELECT/INSERT/UPDATE permissions. Do not expose these tables through a public database API.

## API and authentication

`GET /api/planting/events` lists the latest 100 events. `POST` creates one. `GET /api/planting/events/:id` returns event details plus the caller's permitted roster; `POST` registers the caller; `PATCH` accepts either `{action:"role", volunteerId, role}` or `{action:"hours", volunteerId, minutes}`.

Mutations and roster access require the existing signed access-token format. The UI obtains an HttpOnly, SameSite=strict cookie via `/api/planting/events/session`, using the existing single-use nonce store and an origin-bound [SEP-53](https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0053.md) message. Cookie-authenticated writes also require the same Origin. API clients may use an existing `Authorization: Bearer` access token; refresh tokens are rejected. The feature refuses authentication when `JWT_SECRET` is absent. Connecting a wallet alone or setting an admin-role cookie does not grant access.

## Verification

Run `pnpm exec vitest run lib/volunteers` for validation/authentication tests. To also run database tests, explicitly set `VOLUNTEER_TEST_DATABASE_URL` to a disposable local PostgreSQL database. Each run creates and drops a uniquely named test schema; it never falls back to `DATABASE_URL`. Tests cover duplicate signups, roster privacy, role authorization, event timing, hours corrections, concurrent workers, retry limits, and expired leases. Email delivery is mocked; no real emails are sent by tests.
