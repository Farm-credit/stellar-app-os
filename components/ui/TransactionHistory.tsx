import { useEffect, useState } from "react";
import type { TransactionItem } from "../../lib/types/transaction";
import { CardContent } from "../molecules/Card";
import { Button } from "../atoms/Button";

// sample static transactions that simulate a small history
const MOCK_TRANSACTIONS: TransactionItem[] = [
  {
    id: "abcdef1234567890",
    status: "confirmed",
    timestamp: new Date().toISOString(),
    sourceAddress: "GABC...SOURCE1",
    destinationAddress: "GDEF...DEST1",
    amount: "100.0 XLM",
  },
  {
    id: "deadbeef987654321",
    status: "pending",
    timestamp: new Date(Date.now() - 3600_000).toISOString(),
    sourceAddress: "GABC...SOURCE2",
    destinationAddress: "GDEF...DEST2",
    amount: "42.5 XLM",
  },
  {
    id: "feedfacecafebeef",
    status: "failed",
    timestamp: new Date(Date.now() - 7200_000).toISOString(),
    sourceAddress: "GABC...SOURCE3",
    destinationAddress: "GDEF...DEST3",
    amount: "0.0001 XLM",
  },
];

export function TransactionHistory() {
  const [transactions, setTx] = useState<TransactionItem[]>([]);
  const [loading, setLoading] = useState(false);

  function load() {
    setLoading(true);
    // simulate network latency
    setTimeout(() => {
      setTx(MOCK_TRANSACTIONS);
      setLoading(false);
    }, 500);
  }

  useEffect(() => {
    // simulate network latency
    const timer = setTimeout(() => {
      setTx(MOCK_TRANSACTIONS);
    }, 500);
    
    return () => clearTimeout(timer);
  }, []);

  const statusColor = (status: string) =>
    status === "pending"
      ? "bg-yellow-500 p-2  rounded-sm"
      : status === "confirmed"
      ? "bg-green-500 p-2 rounded-sm"
      : "bg-red-500 p-2 rounded-sm";

  return (
    <div className="space-y-4">
      <CardContent className="flex flex-col gap-3 items-center">
        <Button
          onClick={load}
          aria-label="Refresh"
          stellar="primary"
          className="rounded-md shadow-lg px-4 py-3 flex items-start gap-3 w-full max-w-sm transition-all duration-300"
        >
          Refresh
        </Button>
        {loading && (
          <p className="rounded-md shadow-lg px-4 py-3 w-full max-w-sm transition-all duration-300 bg-stellar-blue text-white">
            Loading...
          </p>
        )}
      </CardContent>

      {!loading && transactions.length === 0 && (
        <p className="text-center text-muted">No recent transactions.</p>
      )}

      <ul className="space-y-4">
        {transactions.map((tx) => (
          <li
            key={tx.id}
            className="border p-4 rounded-md flex flex-col sm:flex-row justify-between items-start sm:items-center bg-white shadow-sm"
          >
            <div className="flex-1 w-full sm:w-auto">
              <a
                href={`https://stellar.expert/explorer/public/tx/${tx.id}`}
                target="_blank"
                rel="noreferrer"
                className="underline break-all font-mono text-sm text-blue-600"
              >
                {tx.id}
              </a>
            </div>

            <div className="flex-1 mt-2 sm:mt-0 sm:px-4">
              <div className="text-sm">
                <span className="font-semibold">From:</span> <span className="break-all">{tx.sourceAddress}</span>
              </div>
              <div className="text-sm">
                <span className="font-semibold">To:</span> <span className="break-all">{tx.destinationAddress}</span>
              </div>
              <div className="text-sm">
                <span className="font-semibold">Amount:</span> <span>{tx.amount}</span>
              </div>
            </div>

            <div className="flex flex-col items-end">
              <span
                className={`badge ${statusColor(tx.status)} text-white capitalize`}
              >
                {tx.status}
              </span>
              <span className="text-xs text-muted mt-1">
                {new Date(tx.timestamp).toLocaleString()}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
