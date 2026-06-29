import { networkConfig } from '@/lib/config/network';

const DEFAULT_PLANTING_ADDRESS = 'GABEMKJNR4GK7M4FROGA7I7PG63N2CKE3EGDSBSISG56SVL2O3KRNDXA';

const REGION_PLANTER_POOL: Record<string, string[]> = {
  kano: [
    process.env.NEXT_PUBLIC_REGION_KANO_PLANTER_1 || networkConfig.addresses.planting || DEFAULT_PLANTING_ADDRESS,
    process.env.NEXT_PUBLIC_REGION_KANO_PLANTER_2 || networkConfig.addresses.treeDistributor || DEFAULT_PLANTING_ADDRESS,
  ],
  kaduna: [
    process.env.NEXT_PUBLIC_REGION_KADUNA_PLANTER_1 || networkConfig.addresses.planting || DEFAULT_PLANTING_ADDRESS,
    process.env.NEXT_PUBLIC_REGION_KADUNA_PLANTER_2 || networkConfig.addresses.bulkRecipient || DEFAULT_PLANTING_ADDRESS,
  ],
  sokoto: [
    process.env.NEXT_PUBLIC_REGION_SOKOTO_PLANTER_1 || networkConfig.addresses.planting || DEFAULT_PLANTING_ADDRESS,
    process.env.NEXT_PUBLIC_REGION_SOKOTO_PLANTER_2 || networkConfig.addresses.treeDistributor || DEFAULT_PLANTING_ADDRESS,
  ],
  niger: [
    process.env.NEXT_PUBLIC_REGION_NIGER_PLANTER_1 || networkConfig.addresses.planting || DEFAULT_PLANTING_ADDRESS,
    process.env.NEXT_PUBLIC_REGION_NIGER_PLANTER_2 || networkConfig.addresses.bulkRecipient || DEFAULT_PLANTING_ADDRESS,
  ],
  accra: [
    process.env.NEXT_PUBLIC_REGION_ACCRA_PLANTER_1 || networkConfig.addresses.planting || DEFAULT_PLANTING_ADDRESS,
    process.env.NEXT_PUBLIC_REGION_ACCRA_PLANTER_2 || networkConfig.addresses.treeDistributor || DEFAULT_PLANTING_ADDRESS,
  ],
  nairobi: [
    process.env.NEXT_PUBLIC_REGION_NAIROBI_PLANTER_1 || networkConfig.addresses.planting || DEFAULT_PLANTING_ADDRESS,
    process.env.NEXT_PUBLIC_REGION_NAIROBI_PLANTER_2 || networkConfig.addresses.bulkRecipient || DEFAULT_PLANTING_ADDRESS,
  ],
  kampala: [
    process.env.NEXT_PUBLIC_REGION_KAMPALA_PLANTER_1 || networkConfig.addresses.planting || DEFAULT_PLANTING_ADDRESS,
    process.env.NEXT_PUBLIC_REGION_KAMPALA_PLANTER_2 || networkConfig.addresses.treeDistributor || DEFAULT_PLANTING_ADDRESS,
  ],
};

export function getActivePlantersForRegion(regionId: string): string[] {
  const normalizedRegionId = regionId?.toLowerCase();
  const configuredPlanters = normalizedRegionId
    ? REGION_PLANTER_POOL[normalizedRegionId]?.filter(Boolean) ?? []
    : [];

  if (configuredPlanters.length > 0) {
    return configuredPlanters;
  }

  return [networkConfig.addresses.planting || DEFAULT_PLANTING_ADDRESS];
}
