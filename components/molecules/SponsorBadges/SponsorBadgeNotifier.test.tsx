import { render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SponsorBadgeNotifier } from './SponsorBadgeNotifier';

const addNotification = vi.fn();
const addToast = vi.fn();

vi.mock('@/contexts/NotificationContext', () => ({
  useNotification: () => ({ addNotification, addToast }),
}));
vi.mock('@/contexts/WalletContext', () => ({
  useWalletContext: () => ({ wallet: { isConnected: true, publicKey: 'GSPONSOR' } }),
}));

const badges = [
  {
    id: 'first-tree',
    name: 'First Tree',
    description: 'd',
    earned: true,
    shareText: 's',
    imageUrl: '/i.png',
  },
  {
    id: 'ten-trees',
    name: '10 Trees',
    description: 'd',
    earned: false,
    shareText: null,
    imageUrl: null,
  },
];

beforeEach(() => {
  window.localStorage.clear();
  addNotification.mockClear();
  addToast.mockClear();
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true, badges }) })
  );
});
afterEach(() => vi.unstubAllGlobals());

describe('SponsorBadgeNotifier', () => {
  it('notifies once for a newly earned badge and not again on the next load', async () => {
    const first = render(<SponsorBadgeNotifier />);
    await waitFor(() => expect(addNotification).toHaveBeenCalledTimes(1));
    expect(addNotification.mock.calls[0][0].title).toBe('New badge: First Tree');
    expect(addToast).toHaveBeenCalledTimes(1);
    first.unmount();

    render(<SponsorBadgeNotifier />);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(addNotification).toHaveBeenCalledTimes(1);
  });
});
