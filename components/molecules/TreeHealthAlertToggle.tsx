'use client';

import { useState } from 'react';
import {
  requestNotificationPermission,
  subscribeToPushNotifications,
  unsubscribeFromPushNotifications,
} from '@/lib/notifications';

interface TreeHealthAlertToggleProps {
  /** Wallet public key of the sponsor; null when no wallet is connected. */
  sponsorId: string | null;
}

type Status = 'idle' | 'busy' | 'on' | 'error';

/** Lets a sponsor turn on push alerts for sharp drops in their trees' health. */
export function TreeHealthAlertToggle({ sponsorId }: TreeHealthAlertToggleProps) {
  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState('');

  if (!sponsorId) {
    return (
      <p className="text-sm text-muted-foreground">
        Connect your wallet to get alerts when your tree&apos;s health drops.
      </p>
    );
  }

  async function enable() {
    setStatus('busy');
    const permission = await requestNotificationPermission();
    if (permission !== 'granted') {
      setStatus('error');
      setMessage('Notifications are blocked in this browser.');
      return;
    }
    const subscription = await subscribeToPushNotifications();
    if (!subscription) {
      setStatus('error');
      setMessage('Push alerts are not available in this browser.');
      return;
    }
    const response = await fetch('/api/push/subscriptions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sponsorId, subscription: subscription.toJSON() }),
    });
    if (!response.ok) {
      setStatus('error');
      setMessage('Could not save your alert settings. Please try again.');
      return;
    }
    setStatus('on');
    setMessage('');
  }

  async function disable() {
    setStatus('busy');
    await unsubscribeFromPushNotifications();
    setStatus('idle');
    setMessage('');
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-4">
      <p className="text-sm font-medium">Tree health alerts</p>
      <p className="text-sm text-muted-foreground">
        Get a push notification if your tree&apos;s health drops sharply from pests or drought, with
        what the field team is doing about it.
      </p>
      {status === 'on' ? (
        <button type="button" onClick={disable} className="self-start text-sm underline">
          Turn off alerts
        </button>
      ) : (
        <button
          type="button"
          onClick={enable}
          disabled={status === 'busy'}
          className="self-start rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-60"
        >
          {status === 'busy' ? 'Working…' : 'Turn on alerts'}
        </button>
      )}
      {message && (
        <p role="alert" className="text-sm text-destructive">
          {message}
        </p>
      )}
    </div>
  );
}
