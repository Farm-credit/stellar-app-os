import { getWebhookEvents } from '@/lib/stripe/webhook-store';
import type {
  WebhookDelivery,
  WebhookSubscription,
} from '@/lib/types/webhook';

export const dynamic = 'force-dynamic';

const API_WEBHOOK_SUBSCRIPTIONS: WebhookSubscription[] = [];
const API_WEBHOOK_DELIVERIES: WebhookDelivery[] = [];

const CURRENCY_LABELS: Record<string, string> = {
  XLM: 'XLM',
  USDC: 'USDC',
  USD: 'USD',
  EUR: 'EUR',
  GBP: 'GBP',
};

function formatAmount(
  amount: number | null | undefined,
  currency: string | null | undefined
): string {
  if (amount == null) {
    return '';
  }
  const code = (currency || 'USD').toUpperCase();
  const label = CURRENCY_LABELS[code] ?? code;
  const decimals = code === 'XLM' ? 7 : 2;
  return `${amount.toFixed(decimals)} ${label}`;
}

function formatPaymentMethod(method: string | null | undefined): string {
  if (!method) {
    return '';
  }
  return method
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatApiEventTypes(types: string[] | null | undefined): string {
  if (!types || types.length === 0) {
    return '';
  }
  return types.join(', ');
}

function formatApiDeliveryStatus(status: string | null | undefined): string {
  if (!status) {
    return '';
  }
  return status
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export default function AdminWebhooksPage() {
  const events = getWebhookEvents();
  const apiSubscriptions = API_WEBHOOK_SUBSCRIPTIONS;
  const apiDeliveries = API_WEBHOOK_DELIVERIES;

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem' }}>
      <h1>Farmer Payment Webhook Events</h1>
      <p>Recent {events.length} event(s)</p>
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '14px' }}>
        <thead>
          <tr>
            <th style={{ borderBottom: '2px solid #ddd', padding: '8px', textAlign: 'left' }}>
              Event ID
            </th>
            <th style={{ borderBottom: '2px solid #ddd', padding: '8px', textAlign: 'left' }}>
              Type
            </th>
            <th style={{ borderBottom: '2px solid #ddd', padding: '8px', textAlign: 'left' }}>
              Amount
            </th>
            <th style={{ borderBottom: '2px solid #ddd', padding: '8px', textAlign: 'left' }}>
              Currency
            </th>
            <th style={{ borderBottom: '2px solid #ddd', padding: '8px', textAlign: 'left' }}>
              Payment Method
            </th>
            <th style={{ borderBottom: '2px solid #ddd', padding: '8px', textAlign: 'left' }}>
              Recipient
            </th>
            <th style={{ borderBottom: '2px solid #ddd', padding: '8px', textAlign: 'left' }}>
              Transaction Hash
            </th>
            <th style={{ borderBottom: '2px solid #ddd', padding: '8px', textAlign: 'left' }}>
              Status
            </th>
            <th style={{ borderBottom: '2px solid #ddd', padding: '8px', textAlign: 'left' }}>
              Received At
            </th>
          </tr>
        </thead>
        <tbody>
          {events.length === 0 ? (
            <tr>
              <td colSpan={9} style={{ padding: '8px' }}>
                No webhook events received yet.
              </td>
            </tr>
          ) : (
            events.map((event) => (
              <tr key={event.id}>
                <td style={{ borderBottom: '1px solid #eee', padding: '8px' }}>{event.id}</td>
                <td style={{ borderBottom: '1px solid #eee', padding: '8px' }}>{event.type}</td>
                <td style={{ borderBottom: '1px solid #eee', padding: '8px' }}>
                  {formatAmount(event.amount, event.currency)}
                </td>
                <td style={{ borderBottom: '1px solid #eee', padding: '8px' }}>
                  {event.currency ?? ''}
                </td>
                <td style={{ borderBottom: '1px solid #eee', padding: '8px' }}>
                  {formatPaymentMethod(event.paymentMethod)}
                </td>
                <td style={{ borderBottom: '1px solid #eee', padding: '8px' }}>
                  {event.recipient ?? ''}
                </td>
                <td style={{ borderBottom: '1px solid #eee', padding: '8px' }}>
                  {event.transactionHash ?? ''}
                </td>
                <td style={{ borderBottom: '1px solid #eee', padding: '8px' }}>{event.status}</td>
                <td style={{ borderBottom: '1px solid #eee', padding: '8px' }}>
                  {event.receivedAt}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      <h2 style={{ marginTop: '2rem' }}>Public API Webhook Subscriptions</h2>
      <p>Active {apiSubscriptions.length} subscription(s)</p>
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '14px' }}>
        <thead>
          <tr>
            <th style={{ borderBottom: '2px solid #ddd', padding: '8px', textAlign: 'left' }}>
              Subscription ID
            </th>
            <th style={{ borderBottom: '2px solid #ddd', padding: '8px', textAlign: 'left' }}>
              Client ID
            </th>
            <th style={{ borderBottom: '2px solid #ddd', padding: '8px', textAlign: 'left' }}>
              Endpoint URL
            </th>
            <th style={{ borderBottom: '2px solid #ddd', padding: '8px', textAlign: 'left' }}>
              Event Types
            </th>
            <th style={{ borderBottom: '2px solid #ddd', padding: '8px', textAlign: 'left' }}>
              Status
            </th>
            <th style={{ borderBottom: '2px solid #ddd', padding: '8px', textAlign: 'left' }}>
              Created At
            </th>
          </tr>
        </thead>
        <tbody>
          {apiSubscriptions.length === 0 ? (
            <tr>
              <td colSpan={6} style={{ padding: '8px' }}>
                No public API webhook subscriptions registered yet.
              </td>
            </tr>
          ) : (
            apiSubscriptions.map((subscription) => (
              <tr key={subscription.id}>
                <td style={{ borderBottom: '1px solid #eee', padding: '8px' }}>
                  {subscription.id}
                </td>
                <td style={{ borderBottom: '1px solid #eee', padding: '8px' }}>
                  {subscription.clientId ?? ''}
                </td>
                <td style={{ borderBottom: '1px solid #eee', padding: '8px' }}>
                  {subscription.endpointUrl ?? ''}
                </td>
                <td style={{ borderBottom: '1px solid #eee', padding: '8px' }}>
                  {formatApiEventTypes(subscription.eventTypes)}
                </td>
                <td style={{ borderBottom: '1px solid #eee', padding: '8px' }}>
                  {formatApiDeliveryStatus(subscription.status)}
                </td>
                <td style={{ borderBottom: '1px solid #eee', padding: '8px' }}>
                  {subscription.createdAt ?? ''}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      <h2 style={{ marginTop: '2rem' }}>Public API Webhook Deliveries</h2>
      <p>Recent {apiDeliveries.length} delivery attempt(s)</p>
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '14px' }}>
        <thead>
          <tr>
            <th style={{ borderBottom: '2px solid #ddd', padding: '8px', textAlign: 'left' }}>
              Delivery ID
            </th>
            <th style={{ borderBottom: '2px solid #ddd', padding: '8px', textAlign: 'left' }}>
              Subscription ID
            </th>
            <th style={{ borderBottom: '2px solid #ddd', padding: '8px', textAlign: 'left' }}>
              Event Type
            </th>
            <th style={{ borderBottom: '2px solid #ddd', padding: '8px', textAlign: 'left' }}>
              Status
            </th>
            <th style={{ borderBottom: '2px solid #ddd', padding: '8px', textAlign: 'left' }}>
              Attempts
            </th>
            <th style={{ borderBottom: '2px solid #ddd', padding: '8px', textAlign: 'left' }}>
              Response Code
            </th>
            <th style={{ borderBottom: '2px solid #ddd', padding: '8px', textAlign: 'left' }}>
              Delivered At
            </th>
          </tr>
        </thead>
        <tbody>
          {apiDeliveries.length === 0 ? (
            <tr>
              <td colSpan={7} style={{ padding: '8px' }}>
                No public API webhook deliveries recorded yet.
              </td>
            </tr>
          ) : (
            apiDeliveries.map((delivery) => (
              <tr key={delivery.id}>
                <td style={{ borderBottom: '1px solid #eee', padding: '8px' }}>{delivery.id}</td>
                <td style={{ borderBottom: '1px solid #eee', padding: '8px' }}>
                  {delivery.subscriptionId ?? ''}
                </td>
                <td style={{ borderBottom: '1px solid #eee', padding: '8px' }}>
                  {delivery.eventType ?? ''}
                </td>
                <td style={{ borderBottom: '1px solid #eee', padding: '8px' }}>
                  {formatApiDeliveryStatus(delivery.status)}
                </td>
                <td style={{ borderBottom: '1px solid #eee', padding: '8px' }}>
                  {delivery.attempts ?? ''}
                </td>
                <td style={{ borderBottom: '1px solid #eee', padding: '8px' }}>
                  {delivery.responseCode ?? ''}
                </td>
                <td style={{ borderBottom: '1px solid #eee', padding: '8px' }}>
                  {delivery.deliveredAt ?? ''}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
