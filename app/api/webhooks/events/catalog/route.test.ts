/**
 * Route tests for GET /api/webhooks/events/catalog — Issue #1378
 */

import { describe, expect, it } from 'vitest';
import { GET } from './route';
import { OFFSET_VERIFICATION_EVENT_TYPES } from '@/lib/webhook/offset-verification';

const URL_BASE = 'http://localhost:3000/api/webhooks/events/catalog';

function getRequest(query = ''): Request {
  return new Request(`${URL_BASE}${query}`);
}

describe('GET /api/webhooks/events/catalog', () => {
  it('lists every offset-verification event', async () => {
    const response = await GET(getRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('X-Webhook-Version')).toBe('v1');
    expect(response.headers.get('Cache-Control')).toContain('public');
    expect(body.version).toBe('v1');
    expect(body.events.map((event: { type: string }) => event.type)).toEqual([
      ...OFFSET_VERIFICATION_EVENT_TYPES,
    ]);
  });

  it('describes payload fields and ships a usable sample per event', async () => {
    const body = await (await GET(getRequest())).json();

    for (const event of body.events) {
      expect(typeof event.summary).toBe('string');
      expect(event.summary.length).toBeGreaterThan(0);
      expect(event.requiredFields.length).toBeGreaterThan(0);
      expect(Array.isArray(event.optionalFields)).toBe(true);
      expect(event.sample).toBeTypeOf('object');
    }

    const retired = body.events.find(
      (event: { type: string }) => event.type === 'credit.retired'
    );
    expect(retired.requiredFields).toContain('buyerWallet');
    expect(retired.sample.quantityTonnes).toBeGreaterThan(0);
  });

  it('filters to a single event type', async () => {
    const response = await GET(getRequest('?type=price.changed'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.events).toHaveLength(1);
    expect(body.events[0].type).toBe('price.changed');
    expect(body.events[0].sample.changePercent).toBeTypeOf('number');
  });

  it('treats an empty type parameter as no filter', async () => {
    const body = await (await GET(getRequest('?type='))).json();
    expect(body.events).toHaveLength(OFFSET_VERIFICATION_EVENT_TYPES.length);
  });

  it('returns 400 for an unknown event type', async () => {
    const response = await GET(getRequest('?type=credit.issued'));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe('Unknown webhook event type');
    expect(body.details.join(' ')).toContain('credit.verified');
  });
});
