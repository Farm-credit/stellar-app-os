export type TransactionStatus = "pending" | "confirmed" | "failed";

export interface TransactionItem {
  id: string; // transaction hash
  status: TransactionStatus;
  timestamp: string;
  sourceAddress: string;
  destinationAddress: string;
  amount: string;
}