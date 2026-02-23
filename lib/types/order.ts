export type OrderType = 'buy' | 'sell';
export type OrderStatus = 'completed' | 'pending' | 'failed';
export type NetworkType = 'mainnet' | 'testnet';

export interface Order {
  id: string;
  date: string; // ISO string
  type: OrderType;
  projectId: string;
  projectName: string;
  quantity: number;
  price: number;
  status: OrderStatus;
  txHash: string;
  network: NetworkType;
}

export interface PaginatedOrders {
  data: Order[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
