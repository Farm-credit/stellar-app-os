export type DonationStatus = 'pending' | 'completed' | 'failed';

export interface Donation {
  id: string;
  date: Date;
  projectName: string;
  projectId: string;
  amount: number;
  trees: number;
  status: DonationStatus;
  txHash: string;
  network: 'testnet' | 'public';
  certificateUrl?: string;
}

export interface DonationFilters {
  startDate?: Date;
  endDate?: Date;
  status?: DonationStatus | 'all';
}

export interface PaginationResult<T> {
  data: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}
