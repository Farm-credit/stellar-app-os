export type WebhookEventType =
  | 'credit.verified'
  | 'credit.issued'
  | 'credit.retired'
  | 'credit.transferred'
  | 'price.changed'
  | 'project.approved'
  | 'project.status.changed'
  | 'project.updated'
  | 'transaction.completed'
  | 'transaction.failed'
  | 'wallet.created'
  | 'payment.received'
  | 'payment.failed'
  | 'sponsorship.created'
  | 'sponsorship.updated'
  | 'tree.planted'
  | 'tree.verified';

export type WebhookEventStatus = 'success' | 'failed' | 'pending' | 'retrying';

export interface WebhookEventPayload {
  [key: string]: unknown;
}

export interface WebhookEvent {
  id: string;
  timestamp: string;
  eventType: WebhookEventType;
  status: WebhookEventStatus;
  endpoint: string;
  httpStatus: number | null;
  payload: WebhookEventPayload;
  response: string | null;
  errorMessage: string | null;
  retryCount: number;
  maxRetries: number;
  nextRetryAt: string | null;
}

export interface WebhookFilterState {
  search: string;
  status: WebhookEventStatus | 'all';
  eventType: WebhookEventType | 'all';
  sortBy: 'timestamp' | 'eventType' | 'status';
  sortOrder: 'asc' | 'desc';
}

export interface WebhookSubscription {
  id: string;
  clientId: string;
  url: string;
  eventTypes: WebhookEventType[];
  secret: string;
  active: boolean;
  createdAt: string;
}

/**
 * Scopes that a public API webhook subscription may be granted.
 * These mirror the OAuth2 scopes exposed by the public API and are used
 * to restrict which events a third-party integration can receive.
 */
export type WebhookScope =
  | 'trees:read'
  | 'sponsorships:read'
  | 'sponsorships:write'
  | 'credits:read'
  | 'credits:write'
  | 'projects:read'
  | 'transactions:read'
  | 'wallets:read'
  | 'webhooks:manage';

/**
 * Signing secret metadata for a public API webhook subscription.
 * The raw secret is only returned once at creation/rotation time; the
 * `lastFour` value is safe to display in the admin UI.
 */
export interface WebhookSigningSecret {
  id: string;
  lastFour: string;
  algorithm: 'hmac-sha256';
  createdAt: string;
  rotatedAt: string | null;
  expiresAt: string | null;
  active: boolean;
}

export type WebhookDeliveryStatus = 'success' | 'failed' | 'pending' | 'retrying' | 'dropped';

/**
 * A single delivery attempt for a webhook event, used by the admin
 * webhook pages to show the delivery timeline and by the OpenAPI spec
 * to describe the delivery-attempt resource.
 */
export interface WebhookDeliveryAttempt {
  id: string;
  eventId: string;
  subscriptionId: string;
  attemptNumber: number;
  status: WebhookDeliveryStatus;
  requestUrl: string;
  requestHeaders: Record<string, string>;
  requestBody: string;
  responseStatus: number | null;
  responseBody: string | null;
  responseHeaders: Record<string, string> | null;
  errorMessage: string | null;
  durationMs: number | null;
  attemptedAt: string;
  nextRetryAt: string | null;
}

/**
 * Public API webhook subscription as exposed to third-party integrations.
 * Extends the internal subscription model with scopes, signing secret
 * metadata, and delivery statistics.
 */
export interface PublicWebhookSubscription {
  id: string;
  clientId: string;
  url: string;
  description: string | null;
  eventTypes: WebhookEventType[];
  scopes: WebhookScope[];
  signingSecret: WebhookSigningSecret;
  active: boolean;
  apiVersion: string;
  createdAt: string;
  updatedAt: string;
  lastDeliveryAt: string | null;
  lastDeliveryStatus: WebhookDeliveryStatus | null;
  consecutiveFailures: number;
  disabledReason: string | null;
}

export interface PublicWebhookSubscriptionCreateInput {
  url: string;
  description?: string | null;
  eventTypes: WebhookEventType[];
  scopes: WebhookScope[];
  active?: boolean;
}

export interface PublicWebhookSubscriptionUpdateInput {
  url?: string;
  description?: string | null;
  eventTypes?: WebhookEventType[];
  scopes?: WebhookScope[];
  active?: boolean;
}

export interface WebhookDeliveryStats {
  subscriptionId: string;
  totalDeliveries: number;
  successfulDeliveries: number;
  failedDeliveries: number;
  pendingDeliveries: number;
  successRate: number;
  averageLatencyMs: number | null;
  last24hDeliveries: number;
  last24hFailures: number;
}
