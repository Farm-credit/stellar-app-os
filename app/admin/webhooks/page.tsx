'use client';

import type { ReactNode } from 'react';
import { useState } from 'react';
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

export default function AdminWebhooksPage(): ReactNode {
  const [payments, setPayments] = useState<FarmerPayment[]>(mockFarmerPayments);

  const handleProcessPayment = async (paymentId: string): Promise<void> => {
    setPayments((prev) =>
      prev.map((payment) =>
        payment.id === paymentId ? { ...payment, status: 'processing' } : payment,
      ),
    );
    // TODO: Implement API call to process farmer payment
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setPayments((prev) =>
      prev.map((payment) =>
        payment.id === paymentId ? { ...payment, status: 'completed' } : payment,
      ),
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
          Process farmer payments in XLM, USDC, and fiat currency options via bank
          transfers, crypto wallets, and payment apps.
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
                  <td className="px-4 py-3 text-gray-900">
                    {payment.amount.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    {currencyLabels[payment.currency]}
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    {methodLabels[payment.method]}
                  </td>
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
