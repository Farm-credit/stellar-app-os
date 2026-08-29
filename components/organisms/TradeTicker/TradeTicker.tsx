'use client';

import { useEffect, useState } from 'react';

interface Trade {
  id: string;
  buyer: string;
  amount: number;
  project: string;
  timestamp: string;
}

interface TradeTickerProps {
  wsUrl?: string;
}

export function TradeTicker({ wsUrl }: TradeTickerProps) {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!wsUrl) {
      return;
    }

    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      setConnected(true);
      setError(false);
    };

    ws.onmessage = (event) => {
      try {
        const newTrade: Trade = JSON.parse(event.data);

        setTrades((previousTrades) => [newTrade, ...previousTrades].slice(0, 10));
      } catch {
        setError(true);
      }
    };

    ws.onerror = () => {
      setError(true);
      setConnected(false);
    };

    ws.onclose = () => {
      setConnected(false);
    };

    return () => {
      ws.close();
    };
  }, [wsUrl]);

  if (error) {
    return (
      <section className="rounded-lg border p-4 text-sm" role="status" aria-live="polite">
        Live trade updates unavailable.
      </section>
    );
  }

  return (
    <section
      className="mb-6 overflow-hidden rounded-lg border bg-white"
      aria-label="Recent marketplace trades"
      aria-live="polite"
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <span
          className={`h-2 w-2 rounded-full ${connected ? 'bg-green-500' : 'bg-gray-400'}`}
          aria-hidden="true"
        />

        <span className="font-medium">Live Carbon Credit Trades</span>

        <div className="flex-1 overflow-hidden">
          <div className="flex gap-8 whitespace-nowrap animate-marquee">
            {trades.length === 0 ? (
              <span className="text-sm text-gray-500">Waiting for new purchases...</span>
            ) : (
              trades.map((trade) => (
                <span key={trade.id}>
                  {trade.buyer} purchased {trade.amount} credits from {trade.project}
                </span>
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
