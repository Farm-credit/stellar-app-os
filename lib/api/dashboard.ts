export interface DashboardStats {
    totalDonations: number; // in dollars
    carbonCredits: number;
    co2Offset: number; // in kg
}

export interface ActivityEvent {
    id: string;
    type: "donation" | "credit_purchase" | "portfolio_view" | "system";
    description: string;
    timestamp: string;
}

const mockStats: DashboardStats = {
    totalDonations: 12500,
    carbonCredits: 450,
    co2Offset: 450000,
};

const mockActivities: ActivityEvent[] = [
    { id: "1", type: "credit_purchase", description: "Purchased 50 Carbon Credits", timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString() },
    { id: "2", type: "donation", description: "Donated $500 to Reforestation Project", timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString() },
    { id: "3", type: "portfolio_view", description: "Viewed Portfolio", timestamp: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString() },
    { id: "4", type: "credit_purchase", description: "Purchased 100 Carbon Credits", timestamp: new Date(Date.now() - 1000 * 60 * 60 * 72).toISOString() },
    { id: "5", type: "system", description: "Welcome to Stellar Farm Credit!", timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7).toISOString() },
];

export async function getDashboardStats(): Promise<DashboardStats> {
    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 800));

    // Simulate random error 10% of the time to test error state
    if (Math.random() < 0.1) {
        throw new Error("Failed to fetch dashboard stats");
    }

    return mockStats;
}

export async function getRecentActivity(): Promise<ActivityEvent[]> {
    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 1000));

    if (Math.random() < 0.1) {
        throw new Error("Failed to fetch activity");
    }

    return mockActivities;
}
