import type { Instrumentation } from 'next';
import { collectDefaultMetrics, Counter, Registry } from 'prom-client';

/**
 * @sentry/node is Node-only; the Edge runtime has no `process.on`.
 * Prometheus metrics are also Node-only (they rely on Node APIs).
 */
function isNodeRuntime(): boolean {
  return process.env.NEXT_RUNTIME === 'nodejs';
}

type PrometheusState = {
  registry?: Registry;
  requestErrorsCounter?: Counter<string>;
};

const prometheusState = globalThis as unknown as { __prometheusState?: PrometheusState };

function getPrometheusState(): PrometheusState {
  if (!prometheusState.__prometheusState) {
    prometheusState.__prometheusState = {};
  }
  return prometheusState.__prometheusState;
}

function getPrometheusRegistry(): Registry {
  const state = getPrometheusState();
  if (!state.registry) {
    state.registry = new Registry();
    collectDefaultMetrics({ register: state.registry });
  }
  return state.registry;
}

function getRequestErrorsCounter(): Counter<string> {
  const state = getPrometheusState();
  if (!state.requestErrorsCounter) {
    state.requestErrorsCounter = new Counter({
      name: 'app_request_errors_total',
      help: 'Total number of unhandled server errors',
      labelNames: ['route_path', 'method'],
      registers: [getPrometheusRegistry()],
    });
  }
  return state.requestErrorsCounter;
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

  // Initialise Prometheus default metrics (CPu, memory, event loop, etc.).
  try {
    getPrometheusRegistry();
    getRequestErrorsCounter(); // ensure the counter is registered up-front
    logger.info('prometheus metrics collection enabled');
  } catch (error) {
    logger.error('failed to initialise prometheus metrics', { error });
  }
}

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (!isNodeRuntime()) return;

  const { captureRequestError } = await import('@/lib/sentry');
  const { default: logger } = await import('@/lib/logger');

  // Record the error as a Prometheus counter.
  try {
    const counter = getRequestErrorsCounter();
    counter.inc({ route_path: context.routePath || 'unknown', method: request.method });
  } catch (error) {
    logger.error('failed to record prometheus error metric', { error });
  }

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
    routerKin: context.routerKind,
  });
};
