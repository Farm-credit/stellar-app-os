'use client';

import type { ReactNode } from 'react';
import { useState } from 'react';
import Link from 'next/link';
import { Text } from '@/components/atoms/Text';
import { WebhookEventLogsViewer } from '@/components/organisms/WebhookEventLogsViewer/WebhookEventLogsViewer';
import { mockWebhookEvents } from '@/lib/api/mock/webhookEvents';

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

interface ApiWebhookSubscription {
  id: string;
  url: string;
  events: string[];
  status: 'active' | 'paused' | 'disabled';
  createdAt: string;
}

interface ApiWebhookDeliveryAttempt {
  id: string;
  subscriptionId: string;
  eventType: string;
  responseStatus: number | null;
  outcome: 'delivered' | 'failed' | 'retrying';
  attemptedAt: string;
}

const mockApiWebhookSubscriptions: ApiWebhookSubscription[] = [
  {
    id: 'whsub_001',
    url: 'https://partner.example.com/hooks/trees',
    events: ['tree.planted', 'sponsorship.created'],
    status: 'active',
    createdAt: '2024-05-02',
  },
  {
    id: 'whsub_002',
    url: 'https://integrations.example.org/greenledger/webhooks',
    events: ['sponsorship.created', 'sponsorship.refunded'],
    status: 'paused',
    createdAt: '2024-04-18',
  },
];

const mockApiWebhookDeliveryAttempts: ApiWebhookDeliveryAttempt[] = [
  {
    id: 'whdel_001',
    subscriptionId: 'whsub_001',
    eventType: 'sponsorship.created',
    responseStatus: 200,
    outcome: 'delivered',
    attemptedAt: '2024-05-12 14:32 UTC',
  },
  {
    id: 'whdel_002',
    subscriptionId: 'whsub_001',
    eventType: 'tree.planted',
    responseStatus: 500,
    outcome: 'retrying',
    attemptedAt: '2024-05-12 14:05 UTC',
  },
  {
    id: 'whdel_003',
    subscriptionId: 'whsub_002',
    eventType: 'sponsorship.refunded',
    responseStatus: null,
    outcome: 'failed',
    attemptedAt: '2024-05-11 09:47 UTC',
  },
];

const subscriptionStatusClasses: Record<ApiWebhookSubscription['status'], string> = {
  active: 'bg-green-100 text-green-800',
  paused: 'bg-yellow-100 text-yellow-800',
  disabled: 'bg-gray-200 text-gray-700',
};

const deliveryOutcomeClasses: Record<ApiWebhookDeliveryAttempt['outcome'], string> = {
  delivered: 'bg-green-100 text-green-800',
  retrying: 'bg-yellow-100 text-yellow-800',
  failed: 'bg-red-100 text-red-800',
};

export default function AdminWebhooksPage(): ReactNode {
  const [payments, setPayments] = useState<FarmerPayment[]>(mockFarmerPayments);

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
            Public API Webhook Subscriptions
          </Text>
          <Link
            href="/docs/api"
            className="text-sm font-medium text-blue-600 hover:text-blue-700 hover:underline"
          >
            View API documentation
          </Link>
        </div>
        <Text as="p" variant="muted" className="mb-4">
          Third-party integrations receive sponsorship and tree events through the versioned public
          API. Manage subscriptions and review delivery attempts below.
        </Text>
        <div className="mb-6 overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Subscription</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Endpoint URL</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Events</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Status</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {mockApiWebhookSubscriptions.map((subscription) => (
                <tr key={subscription.id}>
                  <td className="px-4 py-3 font-mono text-xs text-gray-900">{subscription.id}</td>
                  <td className="px-4 py-3 text-gray-700">{subscription.url}</td>
                  <td className="px-4 py-3 text-gray-700">{subscription.events.join(', ')}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${subscriptionStatusClasses[subscription.status]}`}
                    >
                      {subscription.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-700">{subscription.createdAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Text as="h3" variant="h4" className="mb-2">
          Recent API Delivery Attempts
        </Text>
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Attempt</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Subscription</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Event</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Response</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Outcome</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Attempted</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {mockApiWebhookDeliveryAttempts.map((attempt) => (
                <tr key={attempt.id}>
                  <td className="px-4 py-3 font-mono text-xs text-gray-900">{attempt.id}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-700">
                    {attempt.subscriptionId}
                  </td>
                  <td className="px-4 py-3 text-gray-700">{attempt.eventType}</td>
                  <td className="px-4 py-3 text-gray-700">
                    {attempt.responseStatus === null ? 'No response' : attempt.responseStatus}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${deliveryOutcomeClasses[attempt.outcome]}`}
                    >
                      {attempt.outcome}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-700">{attempt.attemptedAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <WebhookEventLogsViewer
        events={mockWebhookEvents}
        onRetryEvent={async (eventId) => {
          console.info('Retrying event:', eventId);
          // TODO: Implement API call to retry webhook
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }}
        enableRealtime={true}
      />
    </div>
  );
}
