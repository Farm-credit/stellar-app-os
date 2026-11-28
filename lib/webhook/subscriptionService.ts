import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { deliver, resolveSubscriptionSigningSecrets } from './dispatch';
import {
  OFFSET_VERIFICATION_EVENT_CATALOG,
  isOffsetVerificationEventType,
} from './offset-verification';
import {
  DEFAULT_EXTERNAL_WEBHOOK_EVENTS,
  toPublicSubscriptionDto,
  type PublicWebhookSubscriptionDto,
} from './presenters';
import {
  getSubscriptionForDispatchById,
  insertSubscription,
  rotateSubscriptionSecret,
  updateSubscription,
} from './repository';
import { encryptWebhookSecret, generateWebhookSecret, getSecretLastFour } from './secrets';
import { validateWebhookUrl, WebhookUrlValidationError } from './ssrf';
import { WEBHOOK_EVENT_TYPES, type DispatchEventType, type WebhookEnvelope } from './types';

export class WebhookSubscriptionInputError extends Error {
  readonly status: number;
  readonly details?: unknown;

  constructor(message: string, status = 400, details?: unknown) {
    super(message);
    this.name = 'WebhookSubscriptionInputError';
    this.status = status;
    this.details = details;
  }
}

export function validateEventTypes(rawEvents: unknown, fallbackDefault: string[]): string[] {
  if (rawEvents === undefined) {
    return fallbackDefault;
  }
  if (!Array.isArray(rawEvents)) {
    throw new WebhookSubscriptionInputError('events must be an array of event type strings');
  }
  const normalized = rawEvents
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter(Boolean);
  if (normalized.length === 0) {
    throw new WebhookSubscriptionInputError('At least one webhook event type is required');
  }
  const unsupported = normalized.filter(
    (eventType) => !WEBHOOK_EVENT_TYPES.includes(eventType as DispatchEventType)
  );
  if (unsupported.length > 0) {
    throw new WebhookSubscriptionInputError('Unsupported webhook event type', 400, {
      unsupported,
    });
  }
  return Array.from(new Set(normalized));
}

export async function createExternalSubscription(
  pool: Pool,
  input: {
    url: unknown;
    events?: unknown;
    description?: unknown;
    active?: unknown;
    planterId?: number | null;
    clientId?: string | null;
    apiKeyId?: number | null;
    ownerWallet?: string | null;
  }
): Promise<{ subscription: PublicWebhookSubscriptionDto; secret: string }> {
  if (typeof input.url !== 'string' || !input.url.trim()) {
    throw new WebhookSubscriptionInputError('A valid callback URL is required');
  }

  let validatedUrl: string;
  try {
    const validated = await validateWebhookUrl(input.url, {
      allowHttpLocalhost: process.env.NODE_ENV !== 'production',
    });
    validatedUrl = validated.url;
  } catch (err) {
    throw new WebhookSubscriptionInputError(
      err instanceof WebhookUrlValidationError ? err.message : 'Invalid callback URL'
    );
  }

  const eventTypes = validateEventTypes(input.events, DEFAULT_EXTERNAL_WEBHOOK_EVENTS);
  const description =
    typeof input.description === 'string' && input.description.trim()
      ? input.description.trim().slice(0, 500)
      : null;

  const secret = generateWebhookSecret();
  const secretEncrypted = encryptWebhookSecret(secret);
  const secretLastFour = getSecretLastFour(secret);

  const created = await insertSubscription(pool, {
    planterId: input.planterId ?? null,
    clientId: input.clientId ?? null,
    apiKeyId: input.apiKeyId ?? null,
    ownerWallet: input.ownerWallet ?? null,
    description,
    url: validatedUrl,
    secret: null,
    secretEncrypted,
    secretLastFour,
    eventTypes,
    isActive: typeof input.active === 'boolean' ? input.active : true,
  });

  return {
    subscription: toPublicSubscriptionDto(created),
    secret,
  };
}

export async function updateExternalSubscription(
  pool: Pool,
  selector: { id?: number; publicId?: string; apiKeyId?: number },
  input: {
    url?: unknown;
    events?: unknown;
    description?: unknown;
    active?: unknown;
  }
): Promise<PublicWebhookSubscriptionDto | null> {
  const updates: {
    url?: string;
    eventTypes?: string[];
    description?: string | null;
    isActive?: boolean;
  } = {};

  if (input.url !== undefined) {
    if (typeof input.url !== 'string' || !input.url.trim()) {
      throw new WebhookSubscriptionInputError('url must be a non-empty string');
    }
    try {
      const validated = await validateWebhookUrl(input.url, {
        allowHttpLocalhost: process.env.NODE_ENV !== 'production',
      });
      updates.url = validated.url;
    } catch (err) {
      throw new WebhookSubscriptionInputError(
        err instanceof WebhookUrlValidationError ? err.message : 'Invalid callback URL'
      );
    }
  }

  if (input.events !== undefined) {
    updates.eventTypes = validateEventTypes(input.events, DEFAULT_EXTERNAL_WEBHOOK_EVENTS);
  }

  if (input.description !== undefined) {
    if (input.description === null) {
      updates.description = null;
    } else if (typeof input.description === 'string') {
      updates.description = input.description.trim().slice(0, 500) || null;
    } else {
      throw new WebhookSubscriptionInputError('description must be a string or null');
    }
  }

  if (input.active !== undefined) {
    if (typeof input.active !== 'boolean') {
      throw new WebhookSubscriptionInputError('active must be a boolean');
    }
    updates.isActive = input.active;
  }

  const updated = await updateSubscription(pool, selector, updates);
  return updated ? toPublicSubscriptionDto(updated) : null;
}

export async function rotateExternalSubscriptionSecret(
  pool: Pool,
  selector: { id?: number; publicId?: string; apiKeyId?: number },
  graceWindowHours = 24
): Promise<{
  subscription: PublicWebhookSubscriptionDto;
  secret: string;
  previousSecretExpiresAt: string;
} | null> {
  const secret = generateWebhookSecret();
  const secretEncrypted = encryptWebhookSecret(secret);
  const secretLastFour = getSecretLastFour(secret);
  const previousSecretExpiresAt = new Date(
    Date.now() + Math.max(1, graceWindowHours) * 60 * 60 * 1000
  );

  const rotated = await rotateSubscriptionSecret(pool, selector, {
    secretEncrypted,
    secretLastFour,
    previousSecretExpiresAt,
  });

  if (!rotated) return null;

  return {
    subscription: toPublicSubscriptionDto(rotated),
    secret,
    previousSecretExpiresAt: previousSecretExpiresAt.toISOString(),
  };
}

export async function sendTestPing(
  pool: Pool,
  internalSubscriptionId: number,
  requestedEventType?: string
): Promise<{
  delivered: boolean;
  httpStatus: number | null;
  durationMs: number;
  error: string | null;
  eventType: string;
}> {
  const row = await getSubscriptionForDispatchById(pool, internalSubscriptionId);
  if (!row || row.deleted_at !== null) {
    throw new WebhookSubscriptionInputError('Webhook subscription not found', 404);
  }

  const candidateType =
    requestedEventType && isOffsetVerificationEventType(requestedEventType)
      ? requestedEventType
      : (row.event_types.find((evt) => isOffsetVerificationEventType(evt)) ?? 'credit.verified');

  const descriptor = OFFSET_VERIFICATION_EVENT_CATALOG.find((e) => e.type === candidateType);
  const { activeSecret, previousSecret } = resolveSubscriptionSigningSecrets(row);

  const envelope: WebhookEnvelope = {
    id: randomUUID(),
    type: candidateType as DispatchEventType,
    createdAt: new Date().toISOString(),
    data: {
      ...(descriptor?.sample ?? { test: true }),
      _test: true,
    },
  };

  const result = await deliver(row.url, activeSecret, envelope, { previousSecret });
  return {
    delivered: result.ok,
    httpStatus: result.httpStatus,
    durationMs: result.durationMs,
    error: result.error,
    eventType: candidateType,
  };
}
