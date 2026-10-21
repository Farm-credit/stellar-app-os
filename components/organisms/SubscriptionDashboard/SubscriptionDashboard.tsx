'use client';

import { useEffect, useState } from 'react';
import { CalendarClock, Pause, Play, RefreshCw, TreePine, X } from 'lucide-react';
import { useSubscription } from '@/hooks/useSubscription';
import { useWalletContext } from '@/contexts/WalletContext';
import { TREE_SPECIES } from '@/lib/constants/species';
import type { SponsorshipSubscription } from '@/lib/types/subscription';
import { Button } from '@/components/atoms/Button';
import { Text } from '@/components/atoms/Text';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/molecules/Card';

function formatDate(value: Date | string | null): string {
  if (!value) return 'Not scheduled';
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Not scheduled'
    : date.toLocaleDateString(undefined, { dateStyle: 'medium' });
}

function SubscriptionRow({
  subscription,
  cancelSubscription,
  pauseSubscription,
  resumeSubscription,
  updateSpeciesPreference,
}: {
  subscription: SponsorshipSubscription;
  cancelSubscription: (id: number) => Promise<boolean>;
  pauseSubscription: (id: number, duration: number) => Promise<boolean>;
  resumeSubscription: (id: number) => Promise<boolean>;
  updateSpeciesPreference: (id: number, species: string | null) => Promise<boolean>;
}) {
  const [duration, setDuration] = useState(1);
  const [busy, setBusy] = useState(false);

  const run = async (operation: () => Promise<boolean>) => {
    setBusy(true);
    try {
      await operation();
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <TreePine className="h-5 w-5 text-stellar-green" aria-hidden="true" />
            <h3 className="font-semibold">{subscription.trees_per_month} trees each month</h3>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs capitalize">
              {subscription.status}
            </span>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {subscription.amount.toFixed(2)} {subscription.asset} monthly
          </p>
          <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
            <CalendarClock className="h-4 w-4" aria-hidden="true" />
            Next billing:{' '}
            {subscription.status === 'paused'
              ? `paused until ${formatDate(subscription.pause_until)}`
              : formatDate(subscription.next_billing_date)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {subscription.status === 'paused' ? (
            <Button
              type="button"
              stellar="success-outline"
              disabled={busy}
              onClick={() => run(() => resumeSubscription(subscription.id))}
            >
              <Play className="mr-2 h-4 w-4" aria-hidden="true" /> Resume
            </Button>
          ) : subscription.status === 'active' ? (
            <>
              <label className="sr-only" htmlFor={`pause-${subscription.id}`}>
                Pause duration
              </label>
              <select
                id={`pause-${subscription.id}`}
                value={duration}
                onChange={(event) => setDuration(Number(event.target.value))}
                className="rounded-md border bg-background px-3 text-sm"
              >
                <option value={1}>1 month</option>
                <option value={2}>2 months</option>
                <option value={3}>3 months</option>
              </select>
              <Button
                type="button"
                stellar="primary-outline"
                disabled={busy}
                onClick={() => run(() => pauseSubscription(subscription.id, duration))}
              >
                <Pause className="mr-2 h-4 w-4" aria-hidden="true" /> Pause
              </Button>
            </>
          ) : null}
          {subscription.status !== 'canceled' && (
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              aria-label="Cancel subscription"
              onClick={() => {
                if (window.confirm('Cancel this recurring sponsorship?'))
                  run(() => cancelSubscription(subscription.id));
              }}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          )}
        </div>
      </div>
      <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center">
        <label htmlFor={`species-${subscription.id}`} className="text-sm font-medium">
          Future tree species
        </label>
        <select
          id={`species-${subscription.id}`}
          value={subscription.species_preference ?? ''}
          disabled={busy || subscription.status === 'canceled'}
          onChange={(event) =>
            run(() => updateSpeciesPreference(subscription.id, event.target.value || null))
          }
          className="rounded-md border bg-background px-3 py-2 text-sm sm:min-w-52"
        >
          <option value="">Let the planting team choose</option>
          {TREE_SPECIES.map((species) => (
            <option key={species.slug} value={species.slug}>
              {species.name}
            </option>
          ))}
        </select>
      </div>
    </li>
  );
}

export function SubscriptionDashboard() {
  const { wallet } = useWalletContext();
  const {
    subscriptions,
    loading,
    error,
    fetchSubscriptions,
    cancelSubscription,
    pauseSubscription,
    resumeSubscription,
    updateSpeciesPreference,
  } = useSubscription();

  useEffect(() => {
    void fetchSubscriptions();
  }, [fetchSubscriptions]);

  if (!wallet?.publicKey) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Recurring sponsorships</CardTitle>
          <CardDescription>Connect your wallet to manage subscriptions.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Recurring sponsorships</CardTitle>
          <CardDescription>
            Manage billing pauses and preferences for future tree deliveries.
          </CardDescription>
        </div>
        <Button
          type="button"
          variant="ghost"
          aria-label="Refresh subscriptions"
          disabled={loading}
          onClick={() => void fetchSubscriptions()}
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
        </Button>
      </CardHeader>
      <CardContent>
        {loading && subscriptions.length === 0 ? (
          <p role="status" className="py-6 text-sm text-muted-foreground">
            Loading subscriptions…
          </p>
        ) : error ? (
          <div role="alert" className="space-y-3 py-4">
            <Text className="text-destructive">{error}</Text>
            <Button
              type="button"
              stellar="primary-outline"
              onClick={() => void fetchSubscriptions()}
            >
              Try again
            </Button>
          </div>
        ) : subscriptions.length === 0 ? (
          <p className="py-6 text-sm text-muted-foreground">
            You do not have any recurring sponsorships yet.
          </p>
        ) : (
          <ul className="space-y-4">
            {subscriptions.map((subscription) => (
              <SubscriptionRow
                key={subscription.id}
                subscription={subscription}
                cancelSubscription={cancelSubscription}
                pauseSubscription={pauseSubscription}
                resumeSubscription={resumeSubscription}
                updateSpeciesPreference={updateSpeciesPreference}
              />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
