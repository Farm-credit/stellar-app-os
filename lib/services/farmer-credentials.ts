import type { FarmerCredentials, SustainabilityCertification } from '@/lib/types/issue-1374-1377';
export const CREDENTIALS: FarmerCredentials[] = [
  {
    farmerId: 'farmer-amina',
    farmerName: 'Amina Bello',
    certifications: ['organic', 'regenerative', 'fair_trade'],
    verifiedAt: '2026-01-15T00:00:00.000Z',
    verificationSource: 'FarmCredit verifier network',
  },
  {
    farmerId: 'farmer-diego',
    farmerName: 'Diego Ramirez',
    certifications: ['regenerative', 'b_corp'],
    verifiedAt: '2026-02-10T00:00:00.000Z',
    verificationSource: 'FarmCredit verifier network',
  },
  {
    farmerId: 'farmer-grace',
    farmerName: 'Grace Mensah',
    certifications: ['organic', 'fair_trade'],
    verifiedAt: '2026-02-21T00:00:00.000Z',
    verificationSource: 'FarmCredit verifier network',
  },
];
export const CERTIFICATION_LABELS: Record<SustainabilityCertification, string> = {
  organic: 'Organic',
  regenerative: 'Regenerative',
  fair_trade: 'Fair Trade',
  b_corp: 'B Corp',
};
export function listFarmerCredentials(
  certification?: SustainabilityCertification
): FarmerCredentials[] {
  return CREDENTIALS.filter(
    (farmer) => !certification || farmer.certifications.includes(certification)
  );
}
const SELLER_TO_FARMER: Record<string, string> = {
  'seller-alice': 'farmer-amina',
  'seller-bob': 'farmer-diego',
  'seller-carol': 'farmer-grace',
  'seller-david': 'farmer-diego',
  'seller-emma': 'farmer-amina',
  'seller-frank': 'farmer-amina',
  'seller-grace': 'farmer-grace',
  'seller-henry': 'farmer-grace',
  'seller-isabel': 'farmer-amina',
  'seller-jack': 'farmer-diego',
};
export function credentialsForListing(listingId: string): FarmerCredentials[] {
  const farmerId = SELLER_TO_FARMER[listingId] ?? listingId;
  return CREDENTIALS.filter(
    (farmer) =>
      farmer.farmerId === farmerId || listingId.includes(farmer.farmerId.replace('farmer-', ''))
  );
}
export function certificationMatches(
  certifications: SustainabilityCertification[],
  selected: SustainabilityCertification
): boolean {
  return certifications.includes(selected);
}
