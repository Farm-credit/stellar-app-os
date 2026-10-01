# Farmer education webinar series (Issue #1295)

The farmer webinar series is available at `/farmer-guides/webinars`. The
curriculum in `lib/webinars.ts` publishes sessions across five tracks:
carbon accounting, soil testing, sustainable practices, market trends, and
compliance. The schedule includes session levels, summaries, dates and time
zones, facilitators, seat capacity, and recording links when available.

## Registration and learning resources

- `GET /api/v2/webinars` returns the schedule, upcoming and past sessions, and
  supports topic and text filters.
- `POST /api/v2/webinars/{slug}/registrations` validates a farmer's name, email,
  and optional location. It prevents duplicate sign-ups, closes registration
  when a session starts, and waitlists sign-ups after capacity is reached.
- `GET /api/v2/webinars/{slug}/calendar` returns an iCalendar event.
- `GET /api/v2/webinars/progress` reports curriculum progress for attended
  sessions.

The series page and registration flow are implemented in
`components/organisms/WebinarSeries/`; the API is under
`app/api/v2/webinars/`. Registration counts are currently held in process
memory by `lib/webinarRegistrations.ts`, so durable registrations across
restarts or multiple application instances require a persistent store before
production use.

## Verification

- `lib/webinars.test.ts` and `lib/__tests__/webinarsV2.test.ts` cover schedule
  dates, filters, registration validation, duplicate and late sign-ups, seat
  limits, waitlisting, calendar output, and progress.
- `components/organisms/WebinarSeries/__tests__/` covers the series UI and
  registration form.
- `app/api/v2/webinars/route.test.ts` exercises the versioned API behavior.

This guide records the existing v1 implementation for
[Farm-credit/stellar-app-os#1295](https://github.com/Farm-credit/stellar-app-os/issues/1295).
