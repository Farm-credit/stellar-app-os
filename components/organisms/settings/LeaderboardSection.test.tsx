import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LeaderboardSection } from './LeaderboardSection';
const mocks = vi.hoisted(() => ({
  wallet: { publicKey: 'wallet-a', type: 'freighter' },
  authenticate: vi.fn(),
}));
vi.mock('@/contexts/WalletContext', () => ({ useWalletContext: () => ({ wallet: mocks.wallet }) }));
vi.mock('@/lib/auth/authenticateFreighter', () => ({ authenticateFreighter: mocks.authenticate }));
const originalFetch = globalThis.fetch;
afterEach(() => {
  vi.stubGlobal('fetch', originalFetch);
  mocks.wallet = { publicKey: 'wallet-a', type: 'freighter' };
});
describe('leaderboard account settings', () => {
  it('loads saved consent after verification, saves opt-out, and resets on wallet change', async () => {
    mocks.authenticate.mockResolvedValue('access-token');
    const initial = { optedIn: true, displayName: 'Alice', sponsorType: 'individual' };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(initial) })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ...initial, optedIn: false }),
      });
    vi.stubGlobal('fetch', fetchMock);
    const { rerender } = render(<LeaderboardSection />);
    fireEvent.click(screen.getByRole('button', { name: 'Verify wallet to manage privacy' }));
    const checkbox = await screen.findByRole('checkbox');
    expect(checkbox).toBeChecked();
    fireEvent.click(checkbox);
    fireEvent.click(screen.getByRole('button', { name: 'Save leaderboard preferences' }));
    expect(await screen.findByRole('status')).toHaveTextContent('hidden');
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/leaderboard/preferences',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ ...initial, optedIn: false }),
      })
    );
    mocks.wallet = { publicKey: 'wallet-b', type: 'freighter' };
    rerender(<LeaderboardSection />);
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Verify wallet to manage privacy' })
    ).toBeInTheDocument();
  });
  it('reports save failure without displaying a success confirmation', async () => {
    mocks.authenticate.mockResolvedValue('access-token');
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({ optedIn: false, displayName: '', sponsorType: 'individual' }),
        })
        .mockResolvedValueOnce({ ok: false, status: 503 })
    );
    render(<LeaderboardSection />);
    fireEvent.click(screen.getByRole('button', { name: 'Verify wallet to manage privacy' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Save leaderboard preferences' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('not saved'));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
