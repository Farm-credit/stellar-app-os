# Sentry error tracking

Server-side error tracking for the Next.js backend. Unhandled exceptions are
reported to [Sentry](https://sentry.io) and written to the existing Winston
logger, so they stay visible in container logs whether or not Sentry is
configured.

## Configuration

| Variable                    | Required | Default    | Purpose                                                   |
| --------------------------- | -------- | ---------- | --------------------------------------------------------- |
| `SENTRY_DSN`                | yes      | —          | Project DSN. **Blank disables the integration entirely.** |
| `SENTRY_ENVIRONMENT`        | no       | `NODE_ENV` | Environment tag on every event, e.g. `production`.        |
| `SENTRY_RELEASE`            | no       | —          | Version events are attributed to, e.g. a git SHA.         |
| `SENTRY_TRACES_SAMPLE_RATE` | no       | `0`        | Performance-trace sampling, `0`–`1`. Errors ignore this.  |

Find the DSN in Sentry under **Project Settings → Client Keys (DSN)**.

Nothing is sent when `SENTRY_DSN` is unset, which is the expected setup for
local development, CI and tests — every function in `lib/sentry.ts` degrades to
a no-op, so no caller has to branch on whether Sentry is enabled.

An invalid `SENTRY_TRACES_SAMPLE_RATE` (non-numeric, or outside `0`–`1`) falls
back to `0` rather than throwing, so a typo in a deployment environment cannot
stop the server from booting.

## What gets captured

`instrumentation.ts` is the single entry point, and Next.js loads it once per
server process before the rest of the application.

- **Unhandled exceptions and rejections** — `initSentry()` runs in `register()`.
  The Sentry Node SDK's default integrations install
  `process.on('uncaughtException')` and `process.on('unhandledRejection')`
  listeners, so anything unhandled in the server process is reported without
  per-call-site wiring.
- **Request errors** — the `onRequestError` hook covers route handlers, server
  components, server actions and middleware. Next.js catches these itself to
  render an error response, so they never reach the process-level handlers and
  are forwarded explicitly. Events are tagged with `method`, `route_path`,
  `route_type` and `router_kind`, so they group per route in Sentry.

Only the Node.js runtime is instrumented. `@sentry/node` is a Node-only package
and the Edge runtime has no `process.on`, so `register()` returns early when
`NEXT_RUNTIME` is not `nodejs`.

`@sentry/node` is listed in `serverExternalPackages` in `next.config.ts`: its
auto-instrumentation resolves modules with runtime `require`, which Webpack
cannot follow statically.

## Reporting errors from other backend code

Workers and cron jobs are separate processes and do not load
`instrumentation.ts`, so they are **not** covered by the above. To opt one in,
initialise once at startup and flush before exit:

```ts
import { captureException, flushSentry, initSentry } from '@/lib/sentry';

initSentry();

try {
  await runWorker();
} catch (error) {
  captureException(error, { worker: 'indexer' });
  await flushSentry(); // short-lived processes exit before the HTTP request lands
  process.exit(1);
}
```

`initSentry()` is idempotent, so calling it from several entry points is safe.

## Redaction

- Sentry runs with `sendDefaultPii: false`, so cookies, IP addresses and request
  bodies are never attached automatically.
- A `beforeSend` hook redacts credential headers (`authorization`, `cookie`,
  `set-cookie`, `proxy-authorization`, `x-api-key`, `x-auth-token`) and drops
  parsed cookies from any event that still carries them.

`extra` context passed to `captureException` is sent as-is — do not put secrets
or personal data in it.

## Verifying the setup

Add a route that throws and confirm the event arrives in Sentry:

```ts
// app/api/debug-sentry/route.ts — remove after verifying
export function GET() {
  throw new Error('Sentry backend smoke test');
}
```

With `SENTRY_DSN` set, `GET /api/debug-sentry` produces an `unhandled server
error` log line and one Sentry issue tagged `route_path: /api/debug-sentry`.

## Tests

`lib/sentry.test.ts` covers configuration parsing, redaction, idempotent
initialisation and the capture helpers, with `@sentry/node` mocked so no
network calls are made.

```bash
pnpm vitest run lib/sentry.test.ts
```
