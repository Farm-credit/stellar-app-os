export const FARMER_CERTIFICATIONS = ['organic', 'regenerative', 'fair-trade', 'b-corp'] as const;
export type FarmerCertification = (typeof FARMER_CERTIFICATIONS)[number];
export interface FarmerCredential {
  id: string;
  farmerId: string;
  farmerName: string;
  region: string;
  certifications: FarmerCertification[];
  issuedAt: string;
  expiresAt?: string;
  verifier: string;
  status: 'active' | 'expired' | 'pending';
}
