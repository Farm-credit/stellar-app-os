import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkNode } from '../health';

const mockFetch = vi.hoisted(() => vi.fn());
vi.stubGlobal('fetch', mockFetch);

const HORIZON_URL = 'https://horizon-testnet.stellar.org';

beforeEach(() => {
  vi.clearAllMocks();
  mockFetch.mockReset();
});

describe('checkNode', () => {
  it('returns ok for a healthy node', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
    });

    const result = await checkNode({ url: HORIZON_URL, label: 'testnet' });

    expect(result.ok).toBe(true);
    expect(result.url).toBe(HORIZON_URL);
    expect(result.label).toBe('testnet');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.lastCheck).toBeGreaterThan(0);
    expect(result.error).toBeUndefined();
    expect(mockFetch).toHaveBeenCalledWith(
      HORIZON_URL,
      expect.objectContaining({ method: 'HEAD' })
    );
  });

  it('returns ok for 3xx/4xx responses (node is reachable)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
    });

    const result = await checkNode({ url: HORIZON_URL, label: 'testnet' });

    expect(result.ok).toBe(true);
  });

  it('returns error for a node that times out', async () => {
    mockFetch.mockRejectedValueOnce(new DOMException('The operation was aborted', 'AbortError'));

    const result = await checkNode({ url: HORIZON_URL, label: 'testnet' }, 100);

    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('returns error when fetch throws', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network failure'));

    const result = await checkNode({ url: HORIZON_URL, label: 'testnet' });

    expect(result.ok).toBe(false);
    expect(result.error).toContain('Network failure');
  });
});
