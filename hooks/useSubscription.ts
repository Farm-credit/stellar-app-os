'use client';

import { useState, useCallback } from 'react';
import { useWalletContext } from '@/contexts/WalletContext';
import { showToast } from '@/lib/toast';
import type { SponsorshipSubscription, SubscriptionStatus } from '@/lib/types/subscription';

interface SubscriptionListResult {
  data: SponsorshipSubscription[];
  total: number;
}

interface UseSubscriptionReturn {
  subscriptions: SponsorshipSubscription[];
  total: number;
  loading: boolean;
  error: string | null;
  fetchSubscriptions: (filters?: { status?: SubscriptionStatus }) => Promise<void>;
  createSubscription: (params: {
    amount: number;
    trees_per_month?: number;
    email?: string;
    payment_method_id?: string;
  }) => Promise<SponsorshipSubscription | null>;
  cancelSubscription: (subscriptionId: number) => Promise<boolean>;
}

export function useSubscription(): UseSubscriptionReturn {
  const { wallet } = useWalletContext();
  const [subscriptions, setSubscriptions] = useState<SponsorshipSubscription[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSubscriptions = useCallback(
    async (filters?: { status?: SubscriptionStatus }) => {
      if (!wallet?.publicKey) return;
      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams({ wallet: wallet.publicKey });
        if (filters?.status) params.set('status', filters.status);

        const res = await fetch(`/api/subscriptions?${params}`);
        if (!res.ok) throw new Error('Failed to fetch subscriptions');

        const result: SubscriptionListResult = await res.json();
        setSubscriptions(result.data);
        setTotal(result.total);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to fetch subscriptions';
        setError(message);
      } finally {
        setLoading(false);
      }
    },
    [wallet?.publicKey]
  );

  const createSubscription = useCallback(
    async (params: {
      amount: number;
      trees_per_month?: number;
      email?: string;
      payment_method_id?: string;
    }): Promise<SponsorshipSubscription | null> => {
      if (!wallet?.publicKey) {
        showToast('Please connect your wallet first', 'error');
        return null;
      }

      setLoading(true);
      setError(null);

      try {
        const res = await fetch('/api/subscriptions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            wallet: wallet.publicKey,
            ...params,
          }),
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Failed to create subscription');
        }

        const { subscription } = await res.json();
        setSubscriptions((prev) => [subscription, ...prev]);
        setTotal((prev) => prev + 1);
        showToast('Subscription created successfully!', 'success');
        return subscription;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to create subscription';
        setError(message);
        showToast(message, 'error');
        return null;
      } finally {
        setLoading(false);
      }
    },
    [wallet?.publicKey]
  );

  const cancelSubscription = useCallback(
    async (subscriptionId: number): Promise<boolean> => {
      if (!wallet?.publicKey) return false;

      setLoading(true);
      setError(null);

      try {
        const res = await fetch(`/api/subscriptions/${subscriptionId}/cancel`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ wallet: wallet.publicKey }),
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Failed to cancel subscription');
        }

        const { subscription } = await res.json();
        setSubscriptions((prev) => prev.map((s) => (s.id === subscriptionId ? subscription : s)));
        showToast('Subscription canceled', 'success');
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to cancel subscription';
        setError(message);
        showToast(message, 'error');
        return false;
      } finally {
        setLoading(false);
      }
    },
    [wallet?.publicKey]
  );

  return {
    subscriptions,
    total,
    loading,
    error,
    fetchSubscriptions,
    createSubscription,
    cancelSubscription,
  };
}
