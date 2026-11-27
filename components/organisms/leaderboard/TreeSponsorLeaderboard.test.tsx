import '@testing-library/jest-dom/vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TreeSponsorLeaderboard } from './TreeSponsorLeaderboard';
const snapshot = (name = 'Alice') => ({
  entries: [{ rank: 1, displayName: name, trees: 12 }],
  updatedAt: '2026-11-01T12:00:00Z',
});
const originalFetch = globalThis.fetch;
afterEach(() => {
  vi.stubGlobal('fetch', originalFetch);
  vi.useRealTimers();
});
describe('tree sponsorship leaderboard', () => {
  it('switches period/category and displays empty states', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: () => Promise.resolve(snapshot()) });
    vi.stubGlobal('fetch', fetchMock);
    render(<TreeSponsorLeaderboard />);
    expect(await screen.findByText('Alice')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'All time' }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenLastCalledWith(
        expect.stringContaining('period=all-time&type=individual'),
        expect.anything()
      )
    );
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ...snapshot(), entries: [] }),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Corporates' }));
    expect(await screen.findByText('Be among the first')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenLastCalledWith(
      expect.stringContaining('type=corporate'),
      expect.anything()
    );
  });
  it('refreshes after five seconds and clears stale names if the API fails', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: () => Promise.resolve(snapshot()) });
    vi.stubGlobal('fetch', fetchMock);
    render(<TreeSponsorLeaderboard />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText('Alice')).toBeInTheDocument();
    fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve(snapshot('Bob')) });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(screen.queryByText('Alice')).not.toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    fetchMock.mockResolvedValue({ ok: false });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText('Bob')).not.toBeInTheDocument();
  });
});
