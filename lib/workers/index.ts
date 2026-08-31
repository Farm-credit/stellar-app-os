/**
 * Background worker registry.
 *
 * Issue #1176: Centralised entry point for all background job workers.
 * Each worker extends BaseWorker and gets automatic memory monitoring,
 * batch-size bounding, and cleanup on shutdown.
 */

export { BaseWorker, type WorkerConfig, type WorkerMetrics } from './base-worker';
export { EmailDigestWorker } from './email-digest-worker';
