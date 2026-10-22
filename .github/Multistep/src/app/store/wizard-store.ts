import { create } from 'zustand';

export type ProjectType = 'carbon-credit' | 'tree-planting' | null;

export type PaymentStatus = 'unpaid' | 'pending' | 'paid';

export interface ReferralStats {
  clicks: number;
  signUps: number;
  treesEarned: number;
}

export interface ProjectData {
  // Step 1: Project Selection
  projectType: ProjectType;
  projectName: string;
  location: string;

  // Step 2: Project Parameters
  estimatedCredits: number;
  projectSize: number;
  projectDuration: number;
  pricePerCredit: number;

  // Step 4: Payment (Stellar)
  stellarWalletAddress: string;
  paymentTransactionHash: string;
  paymentStatus: PaymentStatus;

  // Referral programme
  referralCode: string;
  referredByCode: string;
  referralRewardApplied: boolean;
}

interface WizardState {
  currentStep: number;
  projectData: ProjectData;
  referralStats: ReferralStats;
  setCurrentStep: (step: number) => void;
  updateProjectData: (data: Partial<ProjectData>) => void;
  resetWizard: () => void;
  nextStep: () => void;
  prevStep: () => void;
  getReferralLink: () => string;
  recordReferralClick: () => void;
  recordReferralSignUp: () => void;
  applyReferralReward: () => void;
}

const generateReferralCode = (): string => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i += 1) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

const initialProjectData: ProjectData = {
  projectType: null,
  projectName: '',
  location: '',
  estimatedCredits: 0,
  projectSize: 0,
  projectDuration: 12,
  pricePerCredit: 15,
  stellarWalletAddress: '',
  paymentTransactionHash: '',
  paymentStatus: 'unpaid',
  referralCode: generateReferralCode(),
  referredByCode: '',
  referralRewardApplied: false,
};

const initialReferralStats: ReferralStats = {
  clicks: 0,
  signUps: 0,
  treesEarned: 0,
};

export const useWizardStore = create<WizardState>((set, get) => ({
  currentStep: 1,
  projectData: initialProjectData,
  referralStats: initialReferralStats,
  setCurrentStep: (step) => set({ currentStep: step }),
  updateProjectData: (data) =>
    set((state) => ({
      projectData: { ...state.projectData, ...data },
    })),
  resetWizard: () =>
    set({
      currentStep: 1,
      projectData: { ...initialProjectData, referralCode: generateReferralCode() },
      referralStats: initialReferralStats,
    }),
  nextStep: () =>
    set((state) => ({
      currentStep: Math.min(state.currentStep + 1, 4),
    })),
  prevStep: () =>
    set((state) => ({
      currentStep: Math.max(state.currentStep - 1, 1),
    })),
  getReferralLink: () => {
    const { referralCode } = get().projectData;
    return `https://handsoff.org/sponsor?ref=${referralCode}`;
  },
  recordReferralClick: () =>
    set((state) => ({
      referralStats: { ...state.referralStats, clicks: state.referralStats.clicks + 1 },
    })),
  recordReferralSignUp: () =>
    set((state) => ({
      referralStats: { ...state.referralStats, signUps: state.referralStats.signUps + 1 },
    })),
  applyReferralReward: () =>
    set((state) => {
      if (state.projectData.referralRewardApplied) {
        return state;
      }
      return {
        projectData: { ...state.projectData, referralRewardApplied: true },
        referralStats: {
          ...state.referralStats,
          treesEarned: state.referralStats.treesEarned + 1,
        },
      };
    }),
}));
