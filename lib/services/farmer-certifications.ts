import type { FarmerCertification, FarmerCredential } from '@/lib/types/farmer-certification';

const credentials: FarmerCredential[] = [
  {
    id: 'cred_001',
    farmerId: 'farmer_001',
    farmerName: 'Amina Okafor',
    region: 'Lagos, Nigeria',
    certifications: ['organic', 'regenerative'],
    issuedAt: '2025-02-01',
    expiresAt: '2027-02-01',
    verifier: 'FarmCredit Verifier Network',
    status: 'active',
  },
  {
    id: 'cred_002',
    farmerId: 'farmer_002',
    farmerName: 'Mateo Silva',
    region: 'Amazonas, Brazil',
    certifications: ['organic', 'fair-trade'],
    issuedAt: '2024-08-10',
    expiresAt: '2026-08-10',
    verifier: 'Rainforest Alliance',
    status: 'active',
  },
  {
    id: 'cred_003',
    farmerId: 'farmer_003',
    farmerName: 'Grace Mwangi',
    region: 'Nakuru, Kenya',
    certifications: ['regenerative', 'b-corp'],
    issuedAt: '2025-05-16',
    expiresAt: '2027-05-16',
    verifier: 'Soil Carbon Standard',
    status: 'active',
  },
];
export function listFarmerCredentials(certifications: FarmerCertification[] = [], region?: string) {
  return credentials.filter(
    (credential) =>
      credential.status === 'active' &&
      (!region || credential.region.toLowerCase().includes(region.toLowerCase())) &&
      certifications.every((certification) => credential.certifications.includes(certification))
  );
}
export function addFarmerCredential(credential: Omit<FarmerCredential, 'id'>): FarmerCredential {
  if (!credential.certifications.length) throw new Error('At least one certification is required');
  const created = { ...credential, id: `cred_${Date.now()}` };
  credentials.push(created);
  return created;
}
