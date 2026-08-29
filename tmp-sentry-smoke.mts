/**
 * Temporary smoke test — NOT part of the repo. Verifies that the real
 * @sentry/node SDK, initialised through lib/sentry.ts, actually puts an
 * envelope on the wire for:
 *   - an uncaught exception
 *   - an unhandled promise rejection
 *   - an explicit captureRequestError() call
 *
 * A local HTTP server stands in for Sentry's ingest endpoint.
 *
 * Usage: pnpm exec tsx tmp-sentry-smoke.mts <uncaught|rejection|request>
 */
import http from 'node:http';

const mode = process.argv[2] ?? 'uncaught';
let sawEnvelope = false;

const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (chunk) => (body += chunk));
  req.on('end', () => {
    sawEnvelope = true;
    console.log(`[fake-sentry] ${req.method} ${req.url} (${body.length} bytes)`);

    const match = /"type":"(event|transaction)"/.exec(body);
    console.log(`[fake-sentry] envelope item type: ${match?.[1] ?? 'unknown'}`);

    for (const marker of ['SMOKE_UNCAUGHT', 'SMOKE_REJECTION', 'SMOKE_REQUEST']) {
      if (body.includes(marker)) console.log(`[fake-sentry] PASS contains ${marker}`);
    }
    if (body.includes('smoke-test')) console.log('[fake-sentry] PASS environment tag present');
    if (body.includes('Bearer super-secret')) console.log('[fake-sentry] FAIL leaked auth header');
    if (body.includes('[REDACTED]')) console.log('[fake-sentry] PASS auth header redacted');
    const mech = /"mechanism":\s*(\{[^}]*\})/.exec(body);
    if (mech) console.log(`[fake-sentry] mechanism: ${mech[1]}`);
    for (const m of ['onuncaughtexception', 'onunhandledrejection']) {
      if (body.includes(m)) console.log(`[fake-sentry] PASS mechanism marker ${m}`);
    }
    const val = /"value":"([^"]{0,60})"/.exec(body);
    if (val) console.log(`[fake-sentry] exception value: ${val[1]}`);

    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{}');
  });
});

// Port 0 lets the OS pick a free port, so repeat runs never collide.
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
const PORT = typeof address === 'object' && address !== null ? address.port : 0;
console.log(`[fake-sentry] listening on 127.0.0.1:${PORT}`);

process.env.SENTRY_DSN = `http://publickey@127.0.0.1:${PORT}/1`;
process.env.SENTRY_ENVIRONMENT = 'smoke-test';

const { initSentry, isSentryEnabled, captureRequestError, flushSentry } = await import(
  './lib/sentry.ts'
);

console.log(`[smoke] initSentry() -> ${initSentry()}`);
console.log(`[smoke] isSentryEnabled() -> ${isSentryEnabled()}`);
console.log(`[smoke] mode: ${mode}`);

process.on('exit', (code) => {
  console.log(`[smoke] exiting code=${code} envelopeReceived=${sawEnvelope}`);
});

if (mode === 'uncaught') {
  // Thrown from a timer so it is genuinely unhandled, exactly as a crash in
  // backend code would be.
  setTimeout(() => {
    throw new Error('SMOKE_UNCAUGHT boom');
  }, 50);
} else if (mode === 'rejection') {
  setTimeout(() => {
    void Promise.reject(new Error('SMOKE_REJECTION boom'));
  }, 50);
  // Sentry's onUnhandledRejection integration defaults to mode 'warn': it
  // captures the event but does not exit, so terminate the script ourselves.
  setTimeout(() => {
    server.close();
    process.exit(sawEnvelope ? 0 : 1);
  }, 3000);
} else {
  captureRequestError(new Error('SMOKE_REQUEST boom'), {
    path: '/api/trees?limit=10',
    method: 'POST',
    routePath: '/api/trees',
    routeType: 'route',
    routerKind: 'App Router',
  });
  console.log(`[smoke] flushed -> ${await flushSentry(5000)}`);
  server.close();
  process.exit(sawEnvelope ? 0 : 1);
}
