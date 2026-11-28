import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  OFFSET_VERIFICATION_EVENT_CATALOG,
  OFFSET_VERIFICATION_EVENT_TYPES,
} from '@/lib/webhook/offset-verification';

describe('docs/openapi.yaml webhook contract parity', () => {
  const specPath = path.join(process.cwd(), 'docs', 'openapi.yaml');
  const rawYaml = fs.readFileSync(specPath, 'utf8');

  it('documents all 5 offset-verification event types in WebhookSubscriptionCreateRequest', () => {
    for (const eventType of OFFSET_VERIFICATION_EVENT_TYPES) {
      expect(rawYaml).toContain(`- ${eventType}`);
    }
    expect(OFFSET_VERIFICATION_EVENT_CATALOG).toHaveLength(5);
  });

  it('documents public CRUD, rotation, test, delivery, catalog, and explicit price PATCH paths', () => {
    const expectedPaths = [
      '/api/v1/webhooks:',
      '/api/v1/webhooks/{id}:',
      '/api/v1/webhooks/{id}/rotate-secret:',
      '/api/v1/webhooks/{id}/test:',
      '/api/v1/webhooks/{id}/deliveries:',
      '/api/webhooks/events/catalog:',
      '/api/v2/carbon-prices:',
      '/api/v2/marketplace/listings/{id}:',
    ];
    for (const p of expectedPaths) {
      expect(rawYaml).toContain(p);
    }
  });

  it('documents WebhookEnvelope, 5 payload schemas, and X-Webhook-* headers', () => {
    const expectedSchemasAndHeaders = [
      'WebhookEnvelope:',
      'CreditVerifiedPayload:',
      'ProjectApprovedPayload:',
      'CreditRetiredPayload:',
      'PriceChangedPayload:',
      'ProjectStatusChangedPayload:',
      'XWebhookId:',
      'XWebhookTimestamp:',
      'XWebhookSignature:',
      'XWebhookVersion:',
    ];
    for (const token of expectedSchemasAndHeaders) {
      expect(rawYaml).toContain(token);
    }
  });
});
