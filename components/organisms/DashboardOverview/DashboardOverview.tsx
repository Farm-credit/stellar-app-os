"use client";

import { useEffect, useState, useCallback } from "react";
import { getDashboardStats, getRecentActivity, type DashboardStats, type ActivityEvent } from "@/lib/api/dashboard";
import { StatCard } from "@/components/molecules/StatCard";
import { QuickActions } from "@/components/molecules/QuickActions";
import { ActivityFeed } from "./ActivityFeed";
import { Text } from "@/components/atoms/Text";
import { FeaturedProjectCard } from "@/components/molecules/FeaturedProjectCard";

export function DashboardOverview() {
    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [activities, setActivities] = useState<ActivityEvent[]>([]);

    const [isStatsLoading, setIsStatsLoading] = useState(true);
    const [isActivitiesLoading, setIsActivitiesLoading] = useState(true);

    const [statsError, setStatsError] = useState(false);
    const [activitiesError, setActivitiesError] = useState(false);

    const fetchStats = useCallback(async () => {
        setIsStatsLoading(true);
        setStatsError(false);
        try {
            const data = await getDashboardStats();
            setStats(data);
        } catch (err) {
            setStatsError(true);
            console.error(err);
        } finally {
            setIsStatsLoading(false);
        }
    }, []);

    const fetchActivities = useCallback(async () => {
        setIsActivitiesLoading(true);
        setActivitiesError(false);
        try {
            const data = await getRecentActivity();
            setActivities(data);
        } catch (err) {
            setActivitiesError(true);
            console.error(err);
        } finally {
            setIsActivitiesLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchStats();
        fetchActivities();
    }, [fetchStats, fetchActivities]);

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: "USD",
            maximumFractionDigits: 0,
        }).format(value);
    };

    const formatNumber = (value: number) => {
        // If exact tree count is requested from total donations, e.g. 1 tree per $5
        return new Intl.NumberFormat("en-US").format(value);
    };

    const formatCo2 = (kg: number) => {
        if (kg >= 1000) {
            return `${formatNumber(kg / 1000)} tons`;
        }
        return `${formatNumber(kg)} kg`;
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-2">
                <Text as="h1" variant="h2">Dashboard</Text>
                <Text className="text-muted-foreground">Welcome back! Here&apos;s your impact overview.</Text>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <StatCard
                    title="Total Donations"
                    value={stats ? formatCurrency(stats.totalDonations) : undefined}
                    subValue={stats ? `${formatNumber(Math.floor(stats.totalDonations / 5))} trees planted` : undefined}
                    isLoading={isStatsLoading}
                    hasError={statsError}
                    onRetry={fetchStats}
                />
                <StatCard
                    title="Carbon Credits Owned"
                    value={stats ? formatNumber(stats.carbonCredits) : undefined}
                    subValue="Active credits"
                    isLoading={isStatsLoading}
                    hasError={statsError}
                    onRetry={fetchStats}
                    isPositive
                />
                <StatCard
                    title="Total CO₂ Offset"
                    value={stats ? formatCo2(stats.co2Offset) : undefined}
                    subValue="Lifetime impact"
                    isLoading={isStatsLoading}
                    hasError={statsError}
                    onRetry={fetchStats}
                    isPositive
                />
            </div>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                <div className="md:col-span-2 lg:col-span-2 space-y-6">
                    <ActivityFeed
                        activities={activities}
                        totalDonations={stats?.totalDonations}
                        isLoading={isActivitiesLoading}
                        hasError={activitiesError}
                        onRetry={fetchActivities}
                        className="min-h-[400px]"
                    />
                </div>
                <div className="md:col-span-2 lg:col-span-1 flex flex-col gap-6">
                    <QuickActions />
                    <FeaturedProjectCard />
                </div>
            </div>
        </div>
    );
}
