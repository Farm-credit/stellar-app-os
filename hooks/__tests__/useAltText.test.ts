import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useAltText } from '@/hooks/useAltText';

describe('useAltText', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns default alt text and does not fetch when imageKey is null or undefined', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { result } = renderHook(() => useAltText(null));

    expect(result.current.altText).toBe('Tree photo');
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('fetches alt text from /api/alt-text when imageKey is provided', async () => {
    const mockResponse = {
      altText: 'A young cedar sapling in moist earth',
      confidence: 94,
      labels: ['Tree', 'Cedar'],
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    } as Response);

    const { result } = renderHook(() => useAltText('trees/cedar-01.jpg'));

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.altText).toBe('A young cedar sapling in moist earth');
    expect(result.current.error).toBeNull();
  });

  it('handles API error gracefully and reverts to default alt text', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 500,
    } as Response);

    const { result } = renderHook(() => useAltText('trees/failing.jpg'));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.altText).toBe('Tree photo');
    expect(result.current.error).toContain('Request failed with status 500');
  });

  it('handles network exceptions gracefully', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network disconnected'));

    const { result } = renderHook(() => useAltText('trees/offline.jpg'));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.altText).toBe('Tree photo');
    expect(result.current.error).toBe('Network disconnected');
  });
});
