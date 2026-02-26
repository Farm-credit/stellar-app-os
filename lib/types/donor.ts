export interface DonorInfo {
  email: string;
  name: string;
  anonymous: boolean;
  privacyAccepted: boolean;
}

export interface DonationFlowState {
  amount: number;
  isMonthly: boolean;
  donorInfo: DonorInfo;
}

export const DEFAULT_DONOR_INFO: DonorInfo = {
  email: '',
  name: '',
  anonymous: false,
  privacyAccepted: false,
};

export const DEFAULT_DONATION_FLOW_STATE: DonationFlowState = {
  amount: 25,
  isMonthly: false,
  donorInfo: { ...DEFAULT_DONOR_INFO },
};
