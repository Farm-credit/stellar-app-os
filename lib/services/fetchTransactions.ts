interface StellarTransaction {
  hash: string;
  successful: boolean;
  created_at: string;
  source_account: string;
  fee_account: string;
  fee_charged: string;
}

export async function fetchRecentTransactions(address: string) {
  const res = await fetch(
    `https://horizon.stellar.org/accounts/${address}/transactions?limit=10`
  );

  if (!res.ok) throw new Error("Failed to load transactions");

  const data = await res.json();

  return data._embedded.records.map((tx: StellarTransaction) => ({
    id: tx.hash,
    status: tx.successful ? "confirmed" : "failed",
    timestamp: tx.created_at,
    sourceAddress: tx.source_account,
    destinationAddress: tx.fee_account,
    amount: tx.fee_charged,
  }));
}