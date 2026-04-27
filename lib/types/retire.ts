export interface RetirementSelection {
  projectId: string;
  projectName: string;
  projectDescription: string;
  assetCode: string;
  issuer: string;
  vintage: number;
  availableQuantity: number;
  quantity: number;
  pricePerTon: number;
  walletAddress?: string;
  retirementDate?: string;
  treeCount?: number;
  co2Offset?: number;
  plantingDate?: string;
  region?: string;
}

export type RetirementTransactionStatus =
  | 'idle'
  | 'preparing'
  | 'signing'
  | 'submitting'
  | 'success'
  | 'error';
