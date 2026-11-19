import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy } from '../../proxy';

const { perIp, tier, findKey } = vi.hoisted(() => ({
  perIp: vi.fn(),
  tier: vi.fn(),
  findKey: vi.fn(),
}));
vi.mock('@/lib/rateLimit', () => ({ checkRateLimit: perIp }));
vi.mock('@/lib/rateLimit/tieredRateLimit', () => ({
  checkTieredRateLimit: tier,
  WINDOW_MS: 3600000,
}));
vi.mock('@/lib/api/apiKeys', () => ({
  findApiKeyByRawValue: findKey,
  touchApiKey: vi.fn(),
  recordApiKeyUsage: vi.fn(),
}));
vi.mock('@/lib/cors', () => ({
  handleCorsPreflight: () => null,
  isOriginAllowed: () => true,
  getCorsHeaders: (origin: string) => ({ 'Access-Control-Allow-Origin': origin }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  perIp.mockResolvedValue({ allowed: true });
  tier.mockResolvedValue({ allowed: true });
  findKey.mockResolvedValue({ id: 'key-1', tier: 'free' });
});

describe('proxy response headers after merge repair', () => {
  it.each([false, true])(
    'preserves correlation and CORS headers with API key=%s',
    async (apiKey) => {
      const headers: Record<string, string> = {
        origin: 'https://allowed.test',
        'x-tx-id': 'trace-1',
      };
      if (apiKey) headers['x-api-key'] = 'test-key';
      const response = await proxy(new NextRequest('http://localhost/api/trees', { headers }));
      expect(response.headers.get('x-tx-id')).toBe('trace-1');
      expect(response.headers.get('access-control-allow-origin')).toBe('https://allowed.test');
      expect(response.headers.get('x-middleware-request-x-tx-id')).toBe('trace-1');
      expect(apiKey ? tier : perIp).toHaveBeenCalledTimes(1);
    }
  );

  it('still rejects an unknown API key', async () => {
    findKey.mockResolvedValue(null);
    const response = await proxy(
      new NextRequest('http://localhost/api/trees', {
        headers: { 'x-api-key': 'unknown', 'x-tx-id': 'trace-1' },
      })
    );
    expect(response.status).toBe(401);
    expect(perIp).not.toHaveBeenCalled();
  });
});
