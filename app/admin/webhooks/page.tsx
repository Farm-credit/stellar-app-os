'use client';

import type { ReactNode } from 'react';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Text } from '@/components/atoms/Text';
import type {
  CatalogEventDescriptor,
  SubscriptionFormValues,
} from '@/components/molecules/WebhookSubscriptionModal/WebhookSubscriptionModal';
import { WebhookEventLogsViewer } from '@/components/organisms/WebhookEventLogsViewer/WebhookEventLogsViewer';
import {
  WebhookSubscriptionsManager,
  type AdminWebhookSubscriptionItem,
} from '@/components/organisms/WebhookSubscriptionsManager/WebhookSubscriptionsManager';
import type { WebhookEvent, WebhookEventStatus, WebhookEventType } from '@/lib/types/webhook';

type PaymentCurrency = 'XLM' | 'USDC' | 'FIAT';
type PaymentMethod = 'bank_transfer' | 'crypto_wallet' | 'payment_app';

interface FarmerPayment {
  id: string;
  farmerName: string;
  amount: number;
  currency: PaymentCurrency;
  method: PaymentMethod;
  destination: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
}

const mockFarmerPayments: FarmerPayment[] = [
  {
    id: 'pay_001',
    farmerName: 'Amara Okafor',
    amount: 1250,
    currency: 'USDC',
    method: 'crypto_wallet',
    destination: 'GABCD...WXYZ',
    status: 'completed',
  },
  {
    id: 'pay_002',
    farmerName: 'Kwame Mensah',
    amount: 480,
    currency: 'XLM',
    method: 'crypto_wallet',
    destination: 'GEFGH...1234',
    status: 'processing',
  },
  {
    id: 'pay_003',
    farmerName: 'Fatima Bello',
    amount: 920.5,
    currency: 'FIAT',
    method: 'bank_transfer',
    destination: '**** 4821',
    status: 'pending',
  },
  {
    id: 'pay_004',
    farmerName: 'Chidi Nwosu',
    amount: 310,
    currency: 'FIAT',
    method: 'payment_app',
    destination: 'chidi@payapp',
    status: 'failed',
  },
];

const currencyLabels: Record<PaymentCurrency, string> = {
  XLM: 'Stellar (XLM)',
  USDC: 'USD Coin (USDC)',
  FIAT: 'Fiat Currency',
};

const methodLabels: Record<PaymentMethod, string> = {
  bank_transfer: 'Bank Transfer',
  crypto_wallet: 'Crypto Wallet',
  payment_app: 'Payment App',
};

interface ApiDeliveryDto {
  id: number;
  eventId: string;
  subscriptionId: number;
  subscriptionPublicId: string | null;
  endpoint: string;
  eventType: string;
  status: WebhookEventStatus;
  httpStatus: number | null;
  payload: Record<string, unknown>;
  response: string | null;
  errorMessage: string | null;
  retryCount: number;
  maxRetries: number;
  nextRetryAt: string | null;
  timestamp: string;
}

function toViewerEvent(d: ApiDeliveryDto): WebhookEvent {
  return {
    id: String(d.id),
    timestamp: d.timestamp,
    eventType: d.eventType as WebhookEventType,
    status: d.status,
    endpoint: d.endpoint,
    httpStatus: d.httpStatus,
    payload: d.payload,
    response: d.response,
    errorMessage: d.errorMessage,
    retryCount: d.retryCount,
    maxRetries: d.maxRetries,
    nextRetryAt: d.nextRetryAt,
  };
}

export default function AdminWebhooksPage(): ReactNode {
  const [payments, setPayments] = useState<FarmerPayment[]>(mockFarmerPayments);
  const [subscriptions, setSubscriptions] = useState<AdminWebhookSubscriptionItem[]>([]);
  const [catalogEvents, setCatalogEvents] = useState<CatalogEventDescriptor[]>([]);
  const [deliveries, setDeliveries] = useState<ApiDeliveryDto[]>([]);
  const [loadingWebhooks, setLoadingWebhooks] = useState(true);

  const loadWebhookData = useCallback(async () => {
    try {
      const [subsRes, delRes, catRes] = await Promise.all([
        fetch('/api/admin/webhooks/subscriptions'),
        fetch('/api/admin/webhooks/deliveries'),
        fetch('/api/webhooks/events/catalog'),
      ]);
      if (subsRes.ok) {
        const subsJson = (await subsRes.json()) as {
          subscriptions?: AdminWebhookSubscriptionItem[];
        };
        setSubscriptions(subsJson.subscriptions ?? []);
      }
      if (delRes.ok) {
        const delJson = (await delRes.json()) as { deliveries?: ApiDeliveryDto[] };
        setDeliveries(delJson.deliveries ?? []);
      }
      if (catRes.ok) {
        const catJson = (await catRes.json()) as { events?: CatalogEventDescriptor[] };
        setCatalogEvents(catJson.events ?? []);
      }
    } finally {
      setLoadingWebhooks(false);
    }
  }, []);

  useEffect(() => {
    void loadWebhookData();
  }, [loadWebhookData]);

  const handleCreateSubscription = async (
    values: SubscriptionFormValues
  ): Promise<{ secret: string }> => {
    const res = await fetch('/api/admin/webhooks/subscriptions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    });
    const data = (await res.json()) as {
      subscription?: AdminWebhookSubscriptionItem;
      secret?: string;
      error?: string;
    };
    if (!res.ok || !data.secret) {
      throw new Error(data.error ?? 'Failed to create subscription');
    }
    await loadWebhookData();
    return { secret: data.secret };
  };

  const handleUpdateSubscription = async (
    id: string,
    values: Partial<SubscriptionFormValues>
  ): Promise<void> => {
    const res = await fetch(`/api/admin/webhooks/subscriptions/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    });
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      throw new Error(data.error ?? 'Failed to update subscription');
    }
    await loadWebhookData();
  };

  const handleRotateSecret = async (id: string): Promise<{ secret: string }> => {
    const res = await fetch(
      `/api/admin/webhooks/subscriptions/${encodeURIComponent(id)}/rotate-secret`,
      { method: 'POST' }
    );
    const data = (await res.json()) as { secret?: string; error?: string };
    if (!res.ok || !data.secret) {
      throw new Error(data.error ?? 'Failed to rotate secret');
    }
    await loadWebhookData();
    return { secret: data.secret };
  };

  const handleTestPing = async (
    id: string
  ): Promise<{
    delivered: boolean;
    httpStatus: number | null;
    durationMs: number;
    error: string | null;
  }> => {
    const res = await fetch(`/api/admin/webhooks/subscriptions/${encodeURIComponent(id)}/test`, {
      method: 'POST',
    });
    return (await res.json()) as {
      delivered: boolean;
      httpStatus: number | null;
      durationMs: number;
      error: string | null;
    };
  };

  const handleDeleteSubscription = async (id: string): Promise<void> => {
    const res = await fetch(`/api/admin/webhooks/subscriptions/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      throw new Error('Failed to delete subscription');
    }
    await loadWebhookData();
  };

  const handleRetryDelivery = async (deliveryId: string): Promise<void> => {
    const res = await fetch('/api/webhooks/retry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deliveryId: Number(deliveryId) }),
    });
    if (!res.ok) {
      throw new Error('Failed to retry delivery');
    }
    await loadWebhookData();
  };

  const handleProcessPayment = async (paymentId: string): Promise<void> => {
    setPayments((prev) =>
      prev.map((payment) =>
        payment.id === paymentId ? { ...payment, status: 'processing' } : payment
      )
    );
    // TODO: Implement API call to process farmer payment
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setPayments((prev) =>
      prev.map((payment) =>
        payment.id === paymentId ? { ...payment, status: 'completed' } : payment
      )
    );
  };

  return (
    <div className="container mx-auto max-w-7xl px-4 py-8 sm:py-10">
      <div className="mb-8">
        <Text as="h1" variant="h2" className="mb-2">
          Webhook Event Logs
        </Text>
        <Text as="p" variant="muted">
          Monitor webhook deliveries, debug integration issues, and retry failed events.
        </Text>
      </div>

      <section className="mb-10">
        <Text as="h2" variant="h3" className="mb-2">
          Farmer Payment Processing
        </Text>
        <Text as="p" variant="muted" className="mb-4">
          Process farmer payments in XLM, USDC, and fiat currency options via bank transfers, crypto
          wallets, and payment apps.
        </Text>
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Farmer</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Amount</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Currency</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Method</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Destination</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Status</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {payments.map((payment) => (
                <tr key={payment.id}>
                  <td className="px-4 py-3 text-gray-900">{payment.farmerName}</td>
                  <td className="px-4 py-3 text-gray-900">{payment.amount.toLocaleString()}</td>
                  <td className="px-4 py-3 text-gray-700">{currencyLabels[payment.currency]}</td>
                  <td className="px-4 py-3 text-gray-700">{methodLabels[payment.method]}</td>
                  <td className="px-4 py-3 text-gray-700">{payment.destination}</td>
                  <td className="px-4 py-3 capitalize text-gray-700">{payment.status}</td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={payment.status === 'processing' || payment.status === 'completed'}
                      onClick={() => void handleProcessPayment(payment.id)}
                    >
                      Process
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mb-10">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <Text as="h2" variant="h3">
            Public API &amp; Offset Webhook Subscriptions
          </Text>
          <Link
            href="/api-docs"
            className="text-sm font-medium text-blue-600 hover:text-blue-700 hover:underline"
          >
            View API documentation
          </Link>
        </div>
        <Text as="p" variant="muted" className="mb-4">
          External integrations receive verified credit, project approval, retirement, price, and
          project status notifications through signed webhooks. Manage subscriptions below.
        </Text>

        <WebhookSubscriptionsManager
          subscriptions={subscriptions}
          catalogEvents={catalogEvents}
          loading={loadingWebhooks}
          onCreate={handleCreateSubscription}
          onUpdate={handleUpdateSubscription}
          onRotateSecret={handleRotateSecret}
          onTestPing={handleTestPing}
          onDelete={handleDeleteSubscription}
        />
      </section>

      <WebhookEventLogsViewer
        events={deliveries.map(toViewerEvent)}
        onRetryEvent={handleRetryDelivery}
        onRefresh={loadWebhookData}
        enableRealtime={true}
      />
    </div>
  );
}
