import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/alt-text/route';

vi.mock('@/lib/aws/rekognition', () => ({
  generateAltTextResult: vi.fn(),
  generateAltTextFromUrl: vi.fn(),
}));

import { generateAltTextResult, generateAltTextFromUrl } from '@/lib/aws/rekognition';

describe('POST /api/alt-text', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(generateAltTextResult).mockResolvedValue({
      altText: 'A mature oak tree in a grassy field',
      confidence: 96,
      labels: ['Tree', 'Oak', 'Field'],
    });
  });

  function createRequest(body: any, ip = '127.0.0.1') {
    return new NextRequest('http://localhost:3000/api/alt-text', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': ip,
      },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    });
  }

  it('returns 400 when body is not valid JSON', async () => {
    const req = new NextRequest('http://localhost:3000/api/alt-text', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '10.0.0.1' },
      body: 'invalid-json{',
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Invalid JSON body');
  });

  it('returns 400 when neither s3Key nor imageUrl is provided', async () => {
    const req = createRequest({}, '10.0.0.2');
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Validation failed');
  });

  it('returns 200 with result when valid s3Key is provided', async () => {
    vi.mocked(generateAltTextResult).mockResolvedValueOnce({
      altText: 'A mature oak tree in a grassy field',
      confidence: 96,
      labels: ['Tree', 'Oak', 'Field'],
    });

    const req = createRequest({ s3Key: 'trees/oak-42.jpg' }, '10.0.0.3');
    const res = await POST(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.altText).toBe('A mature oak tree in a grassy field');
    expect(json.confidence).toBe(96);
    expect(generateAltTextResult).toHaveBeenCalledWith('trees/oak-42.jpg');
  });

  it('returns 200 with result when valid imageUrl is provided', async () => {
    vi.mocked(generateAltTextFromUrl).mockResolvedValueOnce('A palm tree near the coast');

    const req = createRequest({ imageUrl: 'https://example.com/tree.jpg' }, '10.0.0.4');
    const res = await POST(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.altText).toBe('A palm tree near the coast');
    expect(generateAltTextFromUrl).toHaveBeenCalledWith('https://example.com/tree.jpg');
  });

  it('returns 429 when rate limit is exceeded', async () => {
    const ip = '10.99.99.99';
    let lastRes: any;

    for (let i = 0; i < 21; i++) {
      const req = createRequest({ s3Key: `trees/batch-${i}.jpg` }, ip);
      lastRes = await POST(req);
    }

    expect(lastRes.status).toBe(429);
    const json = await lastRes.json();
    expect(json.error).toContain('Rate limit exceeded');
  });
});
