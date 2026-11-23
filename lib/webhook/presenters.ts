import { OFFSET_VERIFICATION_EVENT_TYPES } from './offset-verification';
import { maskWebhookSecret } from './secrets';
import type { SafeWebhookSubscriptionRow } from './types';
import type { WebhookDeliveryWithEndpointRow } from './repository';

export interface PublicWebhookSubscriptionDto {
  id: string;
  internalId: number;
  url: string;
  description: string | null;
  events: string[];
  active: boolean;
  secretLastFour: string | null;
  maskedSecret: string;
  secretRotatedAt: string | null;
  consecutiveFailures: number;
  lastDeliveryAt: string | null;
  lastDeliveryStatus: string | null;
  disabledAt: string | null;
  disabledReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export const DEFAULT_EXTERNAL_WEBHOOK_EVENTS: string[] = [...OFFSET_VERIFICATION_EVENT_TYPES];

function toIsoOrNull(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function toPublicSubscriptionDto(
  row: SafeWebhookSubscriptionRow
): PublicWebhookSubscriptionDto {
  return {
    id: row.public_id ?? String(row.id),
    internalId: row.id,
    url: row.url,
    description: row.description ?? null,
    events: row.event_types,
    active: row.is_active,
    secretLastFour: row.secret_last_four ?? null,
    maskedSecret: maskWebhookSecret(row.secret_last_four),
    secretRotatedAt: toIsoOrNull(row.secret_rotated_at),
    consecutiveFailures: row.consecutive_failures ?? 0,
    lastDeliveryAt: toIsoOrNull(row.last_delivery_at),
    lastDeliveryStatus: row.last_delivery_status ?? null,
    disabledAt: toIsoOrNull(row.disabled_at),
    disabledReason: row.disabled_reason ?? null,
    createdAt: toIsoOrNull(row.created_at) ?? new Date(0).toISOString(),
    updatedAt: toIsoOrNull(row.updated_at) ?? new Date(0).toISOString(),
  };
}

export interface WebhookDeliveryDto {
  id: number;
  eventId: string;
  subscriptionId: number;
  subscriptionPublicId: string | null;
  endpoint: string;
  eventType: string;
  status: string;
  httpStatus: number | null;
  payload: Record<string, unknown>;
  response: string | null;
  errorMessage: string | null;
  retryCount: number;
  maxRetries: number;
  durationMs: number | null;
  nextRetryAt: string | null;
  deliveredAt: string | null;
  failedAt: string | null;
  timestamp: string;
}

export function toDeliveryDto(row: WebhookDeliveryWithEndpointRow): WebhookDeliveryDto {
  return {
    id: row.id,
    eventId: row.event_id,
    subscriptionId: row.subscription_id,
    subscriptionPublicId: row.subscription_public_id ?? null,
    endpoint: row.subscription_url ?? '',
    eventType: row.event_type,
    status: row.status,
    httpStatus: row.http_status,
    payload: row.payload,
    response: row.response_body,
    errorMessage: row.error_message,
    retryCount: row.attempt_count,
    maxRetries: row.max_attempts,
    durationMs: row.duration_ms ?? null,
    nextRetryAt: toIsoOrNull(row.next_attempt_at),
    deliveredAt: toIsoOrNull(row.delivered_at),
    failedAt: toIsoOrNull(row.failed_at),
    timestamp: toIsoOrNull(row.created_at) ?? new Date(0).toISOString(),
  };
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
