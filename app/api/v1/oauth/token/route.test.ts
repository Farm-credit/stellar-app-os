import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';

function makeRequest(body: Record<string, unknown> | string, contentType = 'application/json', authHeader?: string): NextRequest {
  const headers = new Headers();
  headers.set('content-type', contentType);
  if (authHeader) headers.set('authorization', authHeader);

  return new NextRequest('http://localhost:3000/api/v1/oauth/token', {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('OAuth2 Token Endpoint — POST /api/v1/oauth/token', () => {
  it('issues a bearer token for valid client_credentials grant', async () => {
    const req = makeRequest({
      grant_type: 'client_credentials',
      client_id: 'partner_app_01',
      client_secret: 'partner_secret_123',
      scope: 'trees:read projects:read species:read co2:read',
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data).toHaveProperty('access_token');
    expect(data.token_type).toBe('Bearer');
    expect(data.expires_in).toBe(3600);
    expect(data.scope).toContain('trees:read');
    expect(data.scope).toContain('projects:read');
    expect(data.scope).toContain('species:read');
    expect(data.scope).toContain('co2:read');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('supports urlencoded form request body', async () => {
    const params = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: 'partner_urlencoded_01',
      client_secret: 'secret',
      scope: 'trees:read',
    });

    const req = makeRequest(params.toString(), 'application/x-www-form-urlencoded');
    const res = await POST(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.access_token).toBeDefined();
    expect(data.token_type).toBe('Bearer');
    expect(data.scope).toBe('trees:read');
  });

  it('supports HTTP Basic authorization header', async () => {
    const basic = Buffer.from('basic_client_id:basic_secret').toString('base64');
    const req = makeRequest(
      { grant_type: 'client_credentials' },
      'application/json',
      `Basic ${basic}`
    );

    const res = await POST(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.access_token).toBeDefined();
    expect(data.token_type).toBe('Bearer');
  });

  it('returns 400 when grant_type is unsupported', async () => {
    const req = makeRequest({
      grant_type: 'authorization_code',
      client_id: 'app_id',
    });

    const res = await POST(req);
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data.error).toBe('unsupported_grant_type');
  });

  it('provides default sandbox credentials when empty request is sent', async () => {
    const req = makeRequest({ grant_type: 'client_credentials' });
    const res = await POST(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.access_token).toBeDefined();
    expect(data.token_type).toBe('Bearer');
  });
});
