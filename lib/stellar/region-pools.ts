const REGION_POOL_PREFIX = 'NEXT_PUBLIC_REGION_POOL_';

function normalizeRegionId(regionId?: string): string | null {
  if (!regionId) return null;
  const normalized = regionId
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_');
  return normalized.length > 0 ? normalized : null;
}

export interface RegionPlanterAllocation {
  address: string;
  amount: number;
}

export function getRegionPlanterAddresses(regionId?: string): string[] {
  const normalized = normalizeRegionId(regionId);
  if (!normalized) return [];

  const envKey = `${REGION_POOL_PREFIX}${normalized}`;
  const value = process.env[envKey];
  if (!value) return [];

  return value
    .split(',')
    .map((address) => address.trim())
    .filter((address) => address.length > 0);
}

export function getRegionPlanterAllocations(amount: number, regionId?: string): RegionPlanterAllocation[] {
  const addresses = getRegionPlanterAddresses(regionId);
  if (!amount || amount <= 0 || addresses.length === 0) {
    return [];
  }

  const planterCount = addresses.length;
  const baseShare = Math.floor((amount / planterCount) * 1e7) / 1e7;

  return addresses.map((address, index) => ({
    address,
    amount:
      index === 0
        ? parseFloat((amount - baseShare * (planterCount - 1)).toFixed(7))
        : baseShare,
  }));
}
