import { describe, expect, it, vi } from 'vitest';
import type { CertificationProviderConfig } from '../config';
import { ProviderHttpError, ProviderNetworkError } from '../errors';
import { ProviderHttpClient } from '../http-client';

const config: CertificationProviderConfig = {
  provider: 'verra',
  baseUrl: 'https://registry.example/api/v2',
  apiToken: 'provider-secret',
  timeoutMs: 500,
  maxRetries: 2,
  retryBaseDelayMs: 1,
};

describe('ProviderHttpClient', () => {
  it('uses the configured base URL and bearer token without putting it in the URL', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    const client = new ProviderHttpClient(config, fetcher, vi.fn());

    await client.getJson('/projects/VCS-1');

    const [url, init] = fetcher.mock.calls[0];
    expect(String(url)).toBe('https://registry.example/api/v2/projects/VCS-1');
    expect(String(url)).not.toContain('provider-secret');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer provider-secret');
  });

  it('retries retryable provider errors and then succeeds', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'ok' }), { status: 200 }));
    const sleep = vi.fn().mockResolvedValue(undefined);
    const client = new ProviderHttpClient(config, fetcher, sleep);

    await expect(client.getJson('projects/VCS-1')).resolves.toEqual({ id: 'ok' });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(1);
  });

  it('does not retry a non-retryable 401 or expose response credentials', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('token=secret', { status: 401 }));
    const client = new ProviderHttpClient(config, fetcher, vi.fn());

    await expect(client.getJson('projects/VCS-1')).rejects.toMatchObject({
      name: ProviderHttpError.name,
      message: 'verra certification provider returned HTTP 401',
      retryable: false,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('converts terminal network failures into a safe provider error', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('socket failed with provider-secret'));
    const client = new ProviderHttpClient(config, fetcher, vi.fn());

    await expect(client.getJson('projects/VCS-1')).rejects.toBeInstanceOf(ProviderNetworkError);
    await expect(client.getJson('projects/VCS-1')).rejects.not.toThrow(/provider-secret/);
  });
});
