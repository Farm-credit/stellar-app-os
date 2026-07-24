import { type LeaderboardSponsor, type LeaderboardPeriod } from '@/lib/types/leaderboard';

export const mockMonthlySponsors: LeaderboardSponsor[] = [
  {
    rank: 1,
    address: 'GCAWKY2T5OBVWRJZXYY6M7O63H4NPRW5Z2UJV3X7O7WJZL6QT6E342DT',
    name: 'Acme EcoSolutions',
    avatarUrl:
      'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop&face',
    totalTrees: 1420,
    co2Offset: 71.0,
    change: 'same',
  },
  {
    rank: 2,
    address: 'GDMKY37V4D3S8P92JO18JT492T9Q1P5W4D92KM5L1V2DM5L1V2DM5L1V',
    name: 'Canopy Org',
    avatarUrl:
      'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=100&h=100&fit=crop&face',
    totalTrees: 980,
    co2Offset: 49.0,
    change: 'up',
  },
  {
    rank: 3,
    address: 'GB7YP92JO18JT492T9Q1P5W4D92KM5L1V2DM5L1V2DM5L1V2DM5L1V2D',
    name: 'CleanAir Initiative',
    avatarUrl:
      'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=100&h=100&fit=crop&face',
    totalTrees: 850,
    co2Offset: 42.5,
    change: 'down',
  },
  {
    rank: 4,
    address: 'GD3S2S3N4D92KM5L1V2DM5L1V2DM5L1V2DM5L1V2DM5L1V2DM5L1V2D02',
    name: 'Carbon Busters Ltd',
    avatarUrl:
      'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop&face',
    totalTrees: 620,
    co2Offset: 31.0,
    change: 'up',
  },
  {
    rank: 5,
    address: 'GCOPT9Q1P5W4D92KM5L1V2DM5L1V2DM5L1V2DM5L1V2DM5L1V2DM5L1V2',
    avatarUrl:
      'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop&face',
    totalTrees: 510,
    co2Offset: 25.5,
    change: 'same',
  },
  {
    rank: 6,
    address: 'GAVSP5W4D92KM5L1V2DM5L1V2DM5L1V2DM5L1V2DM5L1V2DM5L1V2DM5L',
    name: 'Terraform Agro',
    avatarUrl:
      'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&h=100&fit=crop&face',
    totalTrees: 450,
    co2Offset: 22.5,
    change: 'down',
  },
  {
    rank: 7,
    address: 'GBL9D92KM5L1V2DM5L1V2DM5L1V2DM5L1V2DM5L1V2DM5L1V2DM5L1V2',
    name: 'Oceanic Mangroves',
    avatarUrl:
      'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=100&h=100&fit=crop&face',
    totalTrees: 390,
    co2Offset: 19.5,
    change: 'up',
  },
  {
    rank: 8,
    address: 'GBV2M5L1V2DM5L1V2DM5L1V2DM5L1V2DM5L1V2DM5L1V2DM5L1V2DM5L1',
    name: 'Earthguard Foundation',
    avatarUrl:
      'https://images.unsplash.com/photo-1552058544-f2b08422138a?w=100&h=100&fit=crop&face',
    totalTrees: 310,
    co2Offset: 15.5,
    change: 'same',
  },
  {
    rank: 9,
    address: 'GCU3O18JT492T9Q1P5W4D92KM5L1V2DM5L1V2DM5L1V2DM5L1V2DM5L1V',
    avatarUrl:
      'https://images.unsplash.com/photo-1542206395-9feb3edaa68d?w=100&h=100&fit=crop&face',
    totalTrees: 280,
    co2Offset: 14.0,
    change: 'down',
  },
  {
    rank: 10,
    address: 'GD02T492T9Q1P5W4D92KM5L1V2DM5L1V2DM5L1V2DM5L1V2DM5L1V2DM5',
    name: 'Future Forests',
    avatarUrl:
      'https://images.unsplash.com/photo-1501196354995-cbb51c65aaea?w=100&h=100&fit=crop&face',
    totalTrees: 210,
    co2Offset: 10.5,
    change: 'up',
  },
];

export const mockAllTimeSponsors: LeaderboardSponsor[] = [
  {
    rank: 1,
    address: 'GCAWKY2T5OBVWRJZXYY6M7O63H4NPRW5Z2UJV3X7O7WJZL6QT6E342DT',
    name: 'Acme EcoSolutions',
    avatarUrl:
      'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop&face',
    totalTrees: 12500,
    co2Offset: 625.0,
    change: 'same',
  },
  {
    rank: 2,
    address: 'GB7YP92JO18JT492T9Q1P5W4D92KM5L1V2DM5L1V2DM5L1V2DM5L1V2D',
    name: 'CleanAir Initiative',
    avatarUrl:
      'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=100&h=100&fit=crop&face',
    totalTrees: 9400,
    co2Offset: 470.0,
    change: 'same',
  },
  {
    rank: 3,
    address: 'GDMKY37V4D3S8P92JO18JT492T9Q1P5W4D92KM5L1V2DM5L1V2DM5L1V',
    name: 'Canopy Org',
    avatarUrl:
      'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=100&h=100&fit=crop&face',
    totalTrees: 8200,
    co2Offset: 410.0,
    change: 'same',
  },
  {
    rank: 4,
    address: 'GD3S2S3N4D92KM5L1V2DM5L1V2DM5L1V2DM5L1V2DM5L1V2DM5L1V2D02',
    name: 'Carbon Busters Ltd',
    avatarUrl:
      'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop&face',
    totalTrees: 5900,
    co2Offset: 295.0,
    change: 'up',
  },
  {
    rank: 5,
    address: 'GAVSP5W4D92KM5L1V2DM5L1V2DM5L1V2DM5L1V2DM5L1V2DM5L1V2DM5L',
    name: 'Terraform Agro',
    avatarUrl:
      'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&h=100&fit=crop&face',
    totalTrees: 5100,
    co2Offset: 255.0,
    change: 'down',
  },
  {
    rank: 6,
    address: 'GBL9D92KM5L1V2DM5L1V2DM5L1V2DM5L1V2DM5L1V2DM5L1V2DM5L1V2',
    name: 'Oceanic Mangroves',
    avatarUrl:
      'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=100&h=100&fit=crop&face',
    totalTrees: 4200,
    co2Offset: 210.0,
    change: 'same',
  },
  {
    rank: 7,
    address: 'GCOPT9Q1P5W4D92KM5L1V2DM5L1V2DM5L1V2DM5L1V2DM5L1V2DM5L1V2',
    avatarUrl:
      'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop&face',
    totalTrees: 3800,
    co2Offset: 190.0,
    change: 'up',
  },
  {
    rank: 8,
    address: 'GBV2M5L1V2DM5L1V2DM5L1V2DM5L1V2DM5L1V2DM5L1V2DM5L1V2DM5L1',
    name: 'Earthguard Foundation',
    avatarUrl:
      'https://images.unsplash.com/photo-1552058544-f2b08422138a?w=100&h=100&fit=crop&face',
    totalTrees: 3400,
    co2Offset: 170.0,
    change: 'down',
  },
  {
    rank: 9,
    address: 'GCU3O18JT492T9Q1P5W4D92KM5L1V2DM5L1V2DM5L1V2DM5L1V2DM5L1V',
    avatarUrl:
      'https://images.unsplash.com/photo-1542206395-9feb3edaa68d?w=100&h=100&fit=crop&face',
    totalTrees: 2900,
    co2Offset: 145.0,
    change: 'same',
  },
  {
    rank: 10,
    address: 'GD02T492T9Q1P5W4D92KM5L1V2DM5L1V2DM5L1V2DM5L1V2DM5L1V2DM5',
    name: 'Future Forests',
    avatarUrl:
      'https://images.unsplash.com/photo-1501196354995-cbb51c65aaea?w=100&h=100&fit=crop&face',
    totalTrees: 2400,
    co2Offset: 120.0,
    change: 'same',
  },
];

// Helper to simulate the current user's personal position if they are connected
export const getMockUserStats = (
  publicKey: string,
  period: LeaderboardPeriod
): LeaderboardSponsor => {
  // If the user happens to match one of the mock addresses, we can return that.
  // Otherwise, we return a mock lower position.
  const targetArray = period === 'monthly' ? mockMonthlySponsors : mockAllTimeSponsors;
  const existing = targetArray.find((s) => s.address.toLowerCase() === publicKey.toLowerCase());

  if (existing) {
    return existing;
  }

  // Generate a custom mock ranking for the current user
  return {
    rank: period === 'monthly' ? 18 : 45,
    address: publicKey,
    name: 'You (Demo Wallet)',
    totalTrees: period === 'monthly' ? 90 : 850,
    co2Offset: period === 'monthly' ? 4.5 : 42.5,
    change: 'up',
  };
};

export const fetchLeaderboard = async (
  period: LeaderboardPeriod
): Promise<LeaderboardSponsor[]> => {
  // Simulate API delay
  await new Promise((resolve) => setTimeout(resolve, 600));
  return period === 'monthly' ? [...mockMonthlySponsors] : [...mockAllTimeSponsors];
};
