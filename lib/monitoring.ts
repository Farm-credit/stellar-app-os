import type { AppErrorType } from '@/lib/errorHandling';

export interface MonitoringContext {
  boundary: 'app-error' | 'global-error';
  errorType: AppErrorType;
  digest?: string;
  route?: string;
}

export interface SerializedError {
  name: string;
  message: string;
  stack?: string;
}

export interface MonitoringPayload {
  context: MonitoringContext;
  error: SerializedError;
  timestamp: string;
}

function serializeError(error: Error): SerializedError {
  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
  };
}

function sendToMonitoringService(payload: MonitoringPayload): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.dispatchEvent(new CustomEvent<MonitoringPayload>('app:monitoring:error', { detail: payload }));

    if (process.env.NODE_ENV === 'development') {
      console.error('[Monitoring] Captured boundary error', payload);
    }
  } catch (monitoringError) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[Monitoring] Failed to send payload', monitoringError);
    }
  }
}

export function logBoundaryError(error: Error, context: MonitoringContext): void {
  sendToMonitoringService({
    context,
    error: serializeError(error),
    timestamp: new Date().toISOString(),
  });
}
