import type { UserDashboardData, UserActivity, UserSummaryStats } from '@/types/user-dashboard';

const MOCK_STATS: UserSummaryStats = {
  totalDonationsAmount: 1250,
  totalDonationsTrees: 42,
  totalCarbonCreditsOwned: 15.5,
  totalCO2OffsetKg: 8500,
};

const MOCK_ACTIVITY: UserActivity[] = [
  {
    id: 'activity-001',
    type: 'donation',
    title: 'Donated to Amazon Reforestation',
    description: '10 trees planted',
    timestamp: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
    amount: '100',
    unit: 'USD',
  },
  {
    id: 'activity-002',
    type: 'credit_purchase',
    title: 'Purchased Carbon Credits',
    description: 'Solar Power Project - India',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
    amount: '5.5',
    unit: 'TONS',
  },
  {
    id: 'activity-003',
    type: 'credit_retirement',
    title: 'Retired Carbon Credits',
    description: 'To offset personal travel',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(),
    amount: '2.0',
    unit: 'TONS',
  },
  {
    id: 'activity-004',
    type: 'donation',
    title: 'Donated to Mangrove Restoration',
    description: '5 trees planted',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3).toISOString(),
    amount: '50',
    unit: 'USD',
  },
  {
    id: 'activity-005',
    type: 'donation',
    title: 'Donated to Wind Energy project',
    description: 'Supported sustainable energy infrastructure',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 4).toISOString(),
    amount: '25',
    unit: 'USD',
  },
  {
    id: 'activity-006',
    type: 'credit_purchase',
    title: 'Purchased Carbon Credits',
    description: 'Wind Energy Farm - Texas',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 5).toISOString(),
    amount: '10',
    unit: 'TONS',
  },
  {
    id: 'activity-007',
    type: 'portfolio_view',
    title: 'Viewed Portfolio',
    description: 'Checked current holdings',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 6).toISOString(),
  },
  {
    id: 'activity-008',
    type: 'donation',
    title: 'Monthly Recurring Donation',
    description: 'Automatic support for reforestation',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7).toISOString(),
    amount: '25',
    unit: 'USD',
  },
  {
    id: 'activity-009',
    type: 'credit_purchase',
    title: 'Holiday Credit Purchase',
    description: 'Special contribution to sustainable farming',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString(),
    amount: '2.5',
    unit: 'TONS',
  },
  {
    id: 'activity-010',
    type: 'donation',
    title: 'One-time Donation',
    description: 'Amazon Rainforest Reforestation',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 45).toISOString(),
    amount: '100',
    unit: 'USD',
  },
];

export async function fetchUserDashboard(): Promise<UserDashboardData> {
  // Simulate API delay
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // Simulation support for timeouts/errors
  const shouldError = Math.random() < 0.05;
  if (shouldError) {
    throw new Error('Failed to fetch dashboard data. Please try again.');
  }

  // Handle case for new users with zero activity
  const isNewUser = false; // Toggle for testing
  if (isNewUser) {
    return {
      stats: {
        totalDonationsAmount: 0,
        totalDonationsTrees: 0,
        totalCarbonCreditsOwned: 0,
        totalCO2OffsetKg: 0,
      },
      recentActivity: [],
    };
  }

  return {
    stats: MOCK_STATS,
    recentActivity: MOCK_ACTIVITY,
  };
}
