import { getWebhookEvents } from '@/lib/stripe/webhook-store';

export const dynamic = 'force-dynamic';

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

export default function AdminWebhooksPage() {
  const events = getWebhookEvents();

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
    </div>
  );
}
