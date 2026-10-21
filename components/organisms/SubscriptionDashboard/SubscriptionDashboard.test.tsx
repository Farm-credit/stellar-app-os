import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SubscriptionDashboard } from './SubscriptionDashboard';

const fetchSubscriptions = vi.fn().mockResolvedValue(undefined);
const cancelSubscription = vi.fn().mockResolvedValue(true);
const pauseSubscription = vi.fn().mockResolvedValue(true);
const resumeSubscription = vi.fn().mockResolvedValue(true);
const updateSpeciesPreference = vi.fn().mockResolvedValue(true);
const subscription = {
  id: 7,
  wallet: 'GSPONSOR',
  email: null,
  amount: 25,
  trees_per_month: 2,
  asset: 'USDC',
  stripe_subscription_id: null,
  stripe_customer_id: null,
  status: 'active' as const,
  pause_until: null,
  species_preference: null,
  next_billing_date: new Date('2026-11-15T00:00:00Z'),
  last_billing_date: null,
  created_at: new Date('2026-01-15T00:00:00Z'),
  updated_at: new Date('2026-01-15T00:00:00Z'),
};

vi.mock('@/contexts/WalletContext', () => ({
  useWalletContext: () => ({ wallet: { publicKey: 'GSPONSOR' } }),
}));

vi.mock('@/hooks/useSubscription', () => ({
  useSubscription: () => ({
    subscriptions: [subscription],
    total: 1,
    loading: false,
    error: null,
    fetchSubscriptions,
    createSubscription: vi.fn(),
    cancelSubscription,
    pauseSubscription,
    resumeSubscription,
    updateSpeciesPreference,
  }),
}));

describe('SubscriptionDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists the next billing date and allows a three-month pause', async () => {
    render(<SubscriptionDashboard />);

    expect(screen.getByText(/next billing/i)).toHaveTextContent('Nov 15, 2026');
    expect(screen.getByText(/2 trees each month/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/pause duration/i), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: /pause/i }));

    await waitFor(() => expect(pauseSubscription).toHaveBeenCalledWith(7, 3));
    expect(fetchSubscriptions).toHaveBeenCalled();
  });

  it('updates the future species preference without changing the subscription plan', async () => {
    render(<SubscriptionDashboard />);

    fireEvent.change(screen.getByLabelText(/future tree species/i), {
      target: { value: 'moringa' },
    });

    await waitFor(() => expect(updateSpeciesPreference).toHaveBeenCalledWith(7, 'moringa'));
    expect(screen.getByText(/2 trees each month/i)).toBeInTheDocument();
  });
});
