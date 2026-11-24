/** Types for farmer land-prep financing (credit lines) — Issue #1352 */

export type CreditLineStatus = 'pending' | 'approved' | 'disbursed' | 'repaid' | 'rejected';

export type LandPrepPurpose =
  'clearing' | 'soil_preparation' | 'seedlings' | 'fencing' | 'irrigation' | 'other';

export interface Repayment {
  id: string;
  /** Carbon credit sale the repayment was deducted from. */
  saleId: string;
  amountUsd: number;
  createdAt: string;
}

export interface CreditLine {
  id: string;
  farmerId: string;
  projectId: string;
  purpose: LandPrepPurpose;
  principalUsd: number;
  /** Always 0 — financing is interest free. */
  interestRatePercent: number;
  status: CreditLineStatus;
  repaidUsd: number;
  outstandingUsd: number;
  repayments: Repayment[];
  createdAt: string;
  updatedAt: string;
}

export interface ApplyForCreditLineInput {
  farmerId: string;
  projectId: string;
  purpose: LandPrepPurpose;
  amountUsd: number;
}

export interface RecordCarbonSaleInput {
  saleId: string;
  /** Gross proceeds of the carbon credit sale credited to the farmer. */
  proceedsUsd: number;
}

export interface RecordCarbonSaleResult {
  creditLine: CreditLine;
  repaymentUsd: number;
  /** Proceeds left over for the farmer after repayment. */
  farmerPayoutUsd: number;
}
