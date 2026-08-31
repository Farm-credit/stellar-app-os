import { getWebhookEvents } from '@/lib/stripe/webhook-store';

export const dynamic = 'force-dynamic';

export default function AdminWebhooksPage() {
  const events = getWebhookEvents();

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem' }}>
      <h1>Stripe Webhook Events</h1>
      <p>Recent {events.length} event(s)</p>
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '14px' }}>
        <thead>
          <tr>
            <th style={{ borderBottom: '2px solid #ddd', padding: '8px', textAlign: 'left' }}>Event ID</th>
            <th style={{ borderBottom: '2px solid #ddd', padding: '8px', textAlign: 'left' }}>Type</th>
            <th style={{ borderBottom: '2px solid #ddd', padding: '8px', textAlign: 'left' }}>Amount USD</th>
            <th style={{ borderBottom: '2px solid #ddd', padding: '8px', textAlign: 'left' }}>XLM Amount</th>
            <th style={{ borderBottom: '2px solid #ddd', padding: '8px', textAlign: 'left' }}>Recipient</th>
            <th style={{ borderBottom: '2px solid #ddd', padding: '8px', textAlign: 'left' }}>Transaction Hash</th>
            <th style={{ borderBottom: '2px solid #ddd', padding: '8px', textAlign: 'left' }}>Status</th>
            <th style={{ borderBottom: '2px solid #ddd', padding: '8px', textAlign: 'left' }}>Received At</th>
          </tr>
        </thead>
        <tbody>
          {events.length === 0 ? (
            <tr>
              <td colSpan={8} style={{ padding: '8px' }}>No webhook events received yet.</td>
            </tr>
          ) : (
            events.map((event) => (
              <tr key={event.id}>
                <td style={{ borderBottom: '1px solid #eee', padding: '8px' }}>{event.id}</td>
                <td style={{ borderBottom: '1px solid #eee', padding: '8px' }}>{event.type}</td>
                <td style={{ borderBottom: '1px solid #eee', padding: '8px' }}>{event.amountUsd ?? ''}</td>
                <td style={{ borderBottom: '1px solid #eee', padding: '8px' }}>{event.xlmAmount ?? ''}</td>
                <td style={{ borderBottom: '1px solid #eee', padding: '8px' }}>{event.recipient ?? ''}</td>
                <td style={{ borderBottom: '1px solid #eee', padding: '8px' }}>{event.transactionHash ?? ''}</td>
                <td style={{ borderBottom: '1px solid #eee', padding: '8px' }}>{event.status}</td>
                <td style={{ borderBottom: '1px solid #eee', padding: '8px' }}>{event.receivedAt}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
