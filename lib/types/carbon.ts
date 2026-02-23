export type ProjectType = "Reforestation" | "Renewable Energy" | "Mangrove Restoration" | "Sustainable Agriculture" | "Other";

export type VerificationStatus = "Gold Standard" | "Verra (VCS)" | "Climate Action Reserve" | "Plan Vivo" | "Pending";

export interface CarbonProject {
  id: string;
  name: string;
  description: string;
  vintageYear: number;
  pricePerTon: number;
  availableSupply: number;
  isOutOfStock: boolean;
  type: ProjectType;
  location: string;
  coBenefits: string[];
  verificationStatus: VerificationStatus;
}

export interface CreditSelectionState {
  projectId: string | null;
  quantity: number;
  calculatedPrice: number;
}

export interface CreditSelectionProps {
  projects: CarbonProject[];
  onSelectionChange?: () => void;
}
