import type { Instrumentation } from 'next';

/** `@sentry/node` is Node-only; the Edge runtime has no `process.on`. */
function isNodeRuntime(): boolean {
  return process.env.NEXT_RUNTIME === 'nodejs';
}

export async function register(): Promise<void> {
  if (!isNodeRuntime()) return;

  // Imported dynamically so Sentry is initialised before the modules it
  // instruments are pulled in.
  const { initSentry } = await import('@/lib/sentry');
  const { default: logger } = await import('@/lib/logger');

  if (initSentry()) {
    logger.info('sentry error tracking enabled', {
      environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
    });
  } else {
    logger.info('sentry error tracking disabled: SENTRY_DSN is not set');
  }
}

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (!isNodeRuntime()) return;

  const { captureRequestError } = await import('@/lib/sentry');
  const { default: logger } = await import('@/lib/logger');

  // Errors are logged as well as captured, so they remain visible in the
  // container logs when Sentry is not configured.
  logger.error('unhandled server error', {
    err:
      error instanceof Error
        ? { name: error.name, message: error.message, stack: error.stack }
        : { name: 'NonError', message: String(error) },
    path: request.path,
    method: request.method,
    routePath: context.routePath,
    routeType: context.routeType,
  });

  captureRequestError(error, {
    path: request.path,
    method: request.method,
    routePath: context.routePath,
    routeType: context.routeType,
    routerKind: context.routerKind,
  });
};
