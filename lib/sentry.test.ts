import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ErrorEvent } from '@sentry/node';

vi.mock('@sentry/node', () => ({
  init: vi.fn(),
  captureException: vi.fn(),
  flush: vi.fn(() => Promise.resolve(true)),
}));

const DSN = 'https://examplePublicKey@o0.ingest.sentry.io/0';

/**
 * The module keeps `initialized` in module scope, so each test needs a fresh
 * copy of both the module under test and its mocked SDK.
 */
async function loadSentry() {
  vi.resetModules();
  const sdk = await import('@sentry/node');
  const sentry = await import('@/lib/sentry');
  return { sdk: vi.mocked(sdk), sentry };
}

describe('parseSampleRate', () => {
  it('defaults to 0 when unset or blank', async () => {
    const { sentry } = await loadSentry();

    expect(sentry.parseSampleRate(undefined)).toBe(0);
    expect(sentry.parseSampleRate('')).toBe(0);
    expect(sentry.parseSampleRate('   ')).toBe(0);
  });

  it('accepts valid rates within [0, 1]', async () => {
    const { sentry } = await loadSentry();

    expect(sentry.parseSampleRate('0')).toBe(0);
    expect(sentry.parseSampleRate('0.25')).toBe(0.25);
    expect(sentry.parseSampleRate('1')).toBe(1);
  });

  it('falls back to 0 for values that are not usable rates', async () => {
    const { sentry } = await loadSentry();

    expect(sentry.parseSampleRate('abc')).toBe(0);
    expect(sentry.parseSampleRate('-0.5')).toBe(0);
    expect(sentry.parseSampleRate('2')).toBe(0);
    expect(sentry.parseSampleRate('NaN')).toBe(0);
    expect(sentry.parseSampleRate('Infinity')).toBe(0);
  });
});

describe('resolveSentryConfig', () => {
  it('returns null when no DSN is configured', async () => {
    const { sentry } = await loadSentry();

    expect(sentry.resolveSentryConfig({})).toBeNull();
    expect(sentry.resolveSentryConfig({ SENTRY_DSN: '' })).toBeNull();
    expect(sentry.resolveSentryConfig({ SENTRY_DSN: '   ' })).toBeNull();
  });

  it('prefers SENTRY_ENVIRONMENT over NODE_ENV', async () => {
    const { sentry } = await loadSentry();

    const config = sentry.resolveSentryConfig({
      SENTRY_DSN: DSN,
      SENTRY_ENVIRONMENT: 'staging',
      NODE_ENV: 'production',
    });

    expect(config).toEqual({
      dsn: DSN,
      environment: 'staging',
      release: undefined,
      tracesSampleRate: 0,
    });
  });

  it('falls back to NODE_ENV, then to development', async () => {
    const { sentry } = await loadSentry();

    expect(
      sentry.resolveSentryConfig({ SENTRY_DSN: DSN, NODE_ENV: 'production' })?.environment
    ).toBe('production');
    expect(sentry.resolveSentryConfig({ SENTRY_DSN: DSN })?.environment).toBe('development');
  });

  it('trims the DSN and carries release and sample rate through', async () => {
    const { sentry } = await loadSentry();

    const config = sentry.resolveSentryConfig({
      SENTRY_DSN: `  ${DSN}  `,
      SENTRY_RELEASE: 'abc1234',
      SENTRY_TRACES_SAMPLE_RATE: '0.1',
    });

    expect(config?.dsn).toBe(DSN);
    expect(config?.release).toBe('abc1234');
    expect(config?.tracesSampleRate).toBe(0.1);
  });

  it('treats a blank release as absent', async () => {
    const { sentry } = await loadSentry();

    expect(
      sentry.resolveSentryConfig({ SENTRY_DSN: DSN, SENTRY_RELEASE: '  ' })?.release
    ).toBeUndefined();
  });
});

describe('scrubHeaders', () => {
  it('redacts credential headers regardless of casing', async () => {
    const { sentry } = await loadSentry();

    expect(
      sentry.scrubHeaders({
        Authorization: 'Bearer secret-token',
        COOKIE: 'session=abc',
        'X-Api-Key': 'key-123',
        'content-type': 'application/json',
      })
    ).toEqual({
      Authorization: '[REDACTED]',
      COOKIE: '[REDACTED]',
      'X-Api-Key': '[REDACTED]',
      'content-type': 'application/json',
    });
  });

  it('leaves a header set with nothing sensitive untouched', async () => {
    const { sentry } = await loadSentry();

    const headers = { 'content-type': 'application/json', 'x-request-id': 'req-1' };

    expect(sentry.scrubHeaders(headers)).toEqual(headers);
  });
});

describe('scrubEvent', () => {
  it('redacts request headers and drops cookies', async () => {
    const { sentry } = await loadSentry();

    const event = {
      message: 'boom',
      request: {
        url: 'https://example.com/api/trees',
        headers: { authorization: 'Bearer secret-token', 'content-type': 'application/json' },
        cookies: { session: 'abc' },
      },
    } as unknown as ErrorEvent;

    const scrubbed = sentry.scrubEvent(event);

    expect(scrubbed.request?.headers).toEqual({
      authorization: '[REDACTED]',
      'content-type': 'application/json',
    });
    expect(scrubbed.request?.cookies).toBeUndefined();
    // Everything else is left alone.
    expect(scrubbed.message).toBe('boom');
    expect(scrubbed.request?.url).toBe('https://example.com/api/trees');
  });

  it('handles events with no request attached', async () => {
    const { sentry } = await loadSentry();

    const event = { message: 'boom' } as unknown as ErrorEvent;

    expect(() => sentry.scrubEvent(event)).not.toThrow();
    expect(sentry.scrubEvent(event)).toEqual({ message: 'boom' });
  });
});

describe('initSentry', () => {
  it('does not initialise the SDK when no DSN is configured', async () => {
    const { sdk, sentry } = await loadSentry();

    expect(sentry.initSentry({})).toBe(false);
    expect(sentry.isSentryEnabled()).toBe(false);
    expect(sdk.init).not.toHaveBeenCalled();
  });

  it('initialises the SDK with the resolved configuration', async () => {
    const { sdk, sentry } = await loadSentry();

    expect(
      sentry.initSentry({
        SENTRY_DSN: DSN,
        SENTRY_ENVIRONMENT: 'production',
        SENTRY_RELEASE: 'abc1234',
        SENTRY_TRACES_SAMPLE_RATE: '0.2',
      })
    ).toBe(true);

    expect(sentry.isSentryEnabled()).toBe(true);
    expect(sdk.init).toHaveBeenCalledTimes(1);
    expect(sdk.init).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: DSN,
        environment: 'production',
        release: 'abc1234',
        tracesSampleRate: 0.2,
        sendDefaultPii: false,
      })
    );
  });

  it('scrubs events through the configured beforeSend hook', async () => {
    const { sdk, sentry } = await loadSentry();

    sentry.initSentry({ SENTRY_DSN: DSN });

    const options = sdk.init.mock.calls[0][0];
    const event = {
      request: { headers: { cookie: 'session=abc' } },
    } as unknown as ErrorEvent;

    const sent = options?.beforeSend?.(event, {});

    expect(sent).not.toBeNull();
    expect((sent as ErrorEvent).request?.headers).toEqual({ cookie: '[REDACTED]' });
  });

  it('is idempotent', async () => {
    const { sdk, sentry } = await loadSentry();

    expect(sentry.initSentry({ SENTRY_DSN: DSN })).toBe(true);
    expect(sentry.initSentry({ SENTRY_DSN: DSN })).toBe(true);

    expect(sdk.init).toHaveBeenCalledTimes(1);
  });
});

describe('captureRequestError', () => {
  const context = {
    path: '/api/trees?limit=10',
    method: 'POST',
    routePath: '/api/trees',
    routeType: 'route',
    routerKind: 'App Router',
  };

  it('is a no-op while Sentry is not configured', async () => {
    const { sdk, sentry } = await loadSentry();

    sentry.initSentry({});
    sentry.captureRequestError(new Error('boom'), context);

    expect(sdk.captureException).not.toHaveBeenCalled();
  });

  it('reports the error tagged with its route', async () => {
    const { sdk, sentry } = await loadSentry();
    const error = new Error('boom');

    sentry.initSentry({ SENTRY_DSN: DSN });
    sentry.captureRequestError(error, context);

    expect(sdk.captureException).toHaveBeenCalledTimes(1);
    expect(sdk.captureException).toHaveBeenCalledWith(error, {
      tags: {
        method: 'POST',
        route_path: '/api/trees',
        route_type: 'route',
        router_kind: 'App Router',
      },
      extra: { path: '/api/trees?limit=10' },
    });
  });

  it('forwards non-Error throwables unchanged', async () => {
    const { sdk, sentry } = await loadSentry();

    sentry.initSentry({ SENTRY_DSN: DSN });
    sentry.captureRequestError('string failure', context);

    expect(sdk.captureException).toHaveBeenCalledWith('string failure', expect.anything());
  });
});

describe('captureException', () => {
  it('is a no-op while Sentry is not configured', async () => {
    const { sdk, sentry } = await loadSentry();

    sentry.captureException(new Error('boom'));

    expect(sdk.captureException).not.toHaveBeenCalled();
  });

  it('attaches extra context when provided', async () => {
    const { sdk, sentry } = await loadSentry();
    const error = new Error('worker failed');

    sentry.initSentry({ SENTRY_DSN: DSN });
    sentry.captureException(error, { worker: 'indexer' });

    expect(sdk.captureException).toHaveBeenCalledWith(error, { extra: { worker: 'indexer' } });
  });

  it('omits the scope argument when no extra context is given', async () => {
    const { sdk, sentry } = await loadSentry();
    const error = new Error('worker failed');

    sentry.initSentry({ SENTRY_DSN: DSN });
    sentry.captureException(error);

    expect(sdk.captureException).toHaveBeenCalledWith(error, undefined);
  });
});

describe('flushSentry', () => {
  it('resolves without calling the SDK when Sentry is not configured', async () => {
    const { sdk, sentry } = await loadSentry();

    await expect(sentry.flushSentry()).resolves.toBe(true);
    expect(sdk.flush).not.toHaveBeenCalled();
  });

  it('flushes with the given timeout once configured', async () => {
    const { sdk, sentry } = await loadSentry();

    sentry.initSentry({ SENTRY_DSN: DSN });

    await expect(sentry.flushSentry(500)).resolves.toBe(true);
    expect(sdk.flush).toHaveBeenCalledWith(500);
  });
});

beforeEach(() => {
  vi.clearAllMocks();
});
