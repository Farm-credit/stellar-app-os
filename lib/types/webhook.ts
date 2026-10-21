export type WebhookEventType =
  | 'credit.issued'
  | 'credit.retired'
  | 'credit.transferred'
  | 'project.approved'
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