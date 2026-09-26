# Sponsor email campaigns

The sponsor email pipeline has two stages:

1. `pnpm email:digests:generate -- --once` aggregates the previous seven days of sponsor activity into idempotent `email_digests` rows. The existing `email-digest` worker renders and sends those rows.
2. `pnpm email:newsletters:send -- --once` drains queued `newsletter_deliveries` in bounded batches. Newsletter campaigns are created through `POST /api/admin/email/newsletters`.

Run the digest generator weekly, for example every Monday after the reporting period closes. The delivery workers may run more frequently because both queues use row locking and idempotent status transitions.

## Segments

- `first-time`: exactly one sponsored tree
- `vip`: five or more sponsored trees
- `lapsed`: no sponsorship activity in the last 90 days
- `regional`: sponsors whose recorded planting region matches the request's `region`

The API supports `GET /api/admin/email/newsletters?segments=vip,regional&region=north` to preview the resolved recipients. `POST` accepts `subject`, `message`, `segments`, and an optional `region`; it queues the campaign before any delivery is attempted. Set `send: true` only for an explicitly approved immediate batch.

`SENDGRID_API_KEY` and `SENDGRID_FROM_EMAIL` must be configured in the worker environment. Delivery failures remain attached to individual delivery rows, while pending rows can be retried by a later worker invocation. No wallet or private-key data is included in campaign payloads.
