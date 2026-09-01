import type { DonationAsset } from './donation-payment';
import type { GiftDetails } from '@/lib/types/gift';
import { DEFAULT_GIFT_DETAILS } from '@/lib/types/gift';

// Re-export GiftDetails for convenience
export type { GiftDetails };

export interface RegionAllocation {
  regionId: string;
  treeCount: number;
}

export interface DonorInfo {
  email: string;
  name: string;
  anonymous: boolean;
  privacyAccepted: boolean;
}

export interface DonationFlowState {
  amount: number;
  treeCount: number;
  isMonthly: boolean;
  /** Stellar payment asset; 'XLM' is converted to USDC on-chain. */
  asset: DonationAsset;
  donorInfo: DonorInfo;
  regionAllocations: RegionAllocation[];
  gift: GiftDetails;
}

export const DEFAULT_DONOR_INFO: DonorInfo = {
  email: '',
  name: '',
  anonymous: false,
  privacyAccepted: false,
};

export const DEFAULT_DONATION_FLOW_STATE: DonationFlowState = {
  amount: 25,
  treeCount: 1,
  isMonthly: false,
  asset: 'USDC',
  donorInfo: { ...DEFAULT_DONOR_INFO },
  regionAllocations: [],
  gift: { ...DEFAULT_GIFT_DETAILS },
};
