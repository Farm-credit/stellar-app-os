import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetFieldMessagingForTest } from '@/lib/api/field-messaging';
import { setTranslationProviderForTest } from '@/lib/messaging/translation';
import { GET, POST } from './route';
import { POST as REPLY } from './reply/route';

vi.mock('@/lib/api/tree-registry', () => ({
  getTreeById: (id: string) =>
    Promise.resolve(
      id === 'tree-001'
        ? { id: 'tree-001', treeId: 'HRV-2024-0001', species: 'Teak', region: 'Kano, Nigeria' }
        : null
    ),
}));

const params = (id: string) => ({ params: Promise.resolve({ id }) });

function json(url: string, body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  resetFieldMessagingForTest();
  setTranslationProviderForTest({
    translate: (text, from, to) => Promise.resolve(`[${from}>${to}] ${text}`),
  });
});

afterEach(() => {
  setTranslationProviderForTest(undefined);
  delete process.env.FIELD_TEAM_API_TOKEN;
});

describe('/api/trees/:id/messages', () => {
  it('sends a sponsor message and returns the thread with the SLA', async () => {
    const response = await POST(
      json('http://localhost/api/trees/tree-001/messages', {
        sponsorId: 'GSPONSOR',
        body: 'Hello',
        language: 'en',
      }),
      params('tree-001')
    );
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.thread.slaBusinessDays).toBe(5);
    expect(data.thread.replyDueAt).toEqual(expect.any(String));
    expect(data.thread.messages).toHaveLength(1);
  });

  it('returns the sponsor thread on GET', async () => {
    await POST(
      json('http://localhost/api/trees/tree-001/messages', {
        sponsorId: 'GSPONSOR',
        body: 'Hello',
        language: 'en',
      }),
      params('tree-001')
    );

    const response = await GET(
      new NextRequest('http://localhost/api/trees/tree-001/messages?sponsorId=GSPONSOR&lang=en'),
      params('tree-001')
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.thread.messages).toHaveLength(1);
  });

  it('requires a sponsor id', async () => {
    const response = await GET(
      new NextRequest('http://localhost/api/trees/tree-001/messages'),
      params('tree-001')
    );
    expect(response.status).toBe(400);
  });

  it('returns 404 for an unknown tree', async () => {
    const response = await POST(
      json('http://localhost/api/trees/nope/messages', { sponsorId: 'G', body: 'Hi' }),
      params('nope')
    );
    expect(response.status).toBe(404);
  });

  it('rejects an invalid JSON body', async () => {
    const response = await POST(
      new NextRequest('http://localhost/api/trees/tree-001/messages', {
        method: 'POST',
        body: 'not json',
      }),
      params('tree-001')
    );
    expect(response.status).toBe(400);
  });
});

describe('/api/trees/:id/messages/reply', () => {
  const replyBody = { sponsorId: 'GSPONSOR', body: 'Sannu' };

  async function seedThread() {
    await POST(
      json('http://localhost/api/trees/tree-001/messages', {
        sponsorId: 'GSPONSOR',
        body: 'Hello',
        language: 'en',
      }),
      params('tree-001')
    );
  }

  it('is unavailable when no field team token is configured', async () => {
    const response = await REPLY(
      json('http://localhost/x', replyBody, { authorization: 'Bearer anything' }),
      params('tree-001')
    );
    expect(response.status).toBe(503);
  });

  it('rejects a missing or wrong token', async () => {
    process.env.FIELD_TEAM_API_TOKEN = 'team-secret';
    await seedThread();

    const missing = await REPLY(json('http://localhost/x', replyBody), params('tree-001'));
    const wrong = await REPLY(
      json('http://localhost/x', replyBody, { authorization: 'Bearer nope' }),
      params('tree-001')
    );

    expect(missing.status).toBe(401);
    expect(wrong.status).toBe(401);
  });

  it('accepts a reply with the right token and clears the deadline', async () => {
    process.env.FIELD_TEAM_API_TOKEN = 'team-secret';
    await seedThread();

    const response = await REPLY(
      json('http://localhost/x', replyBody, { authorization: 'Bearer team-secret' }),
      params('tree-001')
    );
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.thread.replyDueAt).toBeNull();
    expect(data.thread.messages).toHaveLength(2);
  });
});
