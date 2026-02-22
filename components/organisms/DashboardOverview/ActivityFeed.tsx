"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/molecules/Card";
import { Text } from "@/components/atoms/Text";
import { Skeleton } from "@/components/atoms/Skeleton";
import { type ActivityEvent } from "@/lib/api/dashboard";
import { cn } from "@/lib/utils";
import { Button } from "@/components/atoms/Button";
import { AlertCircle, History, Leaf, DollarSign, PieChart, Info, Target, TrendingUp } from "lucide-react";

interface ActivityFeedProps {
    activities?: ActivityEvent[];
    totalDonations?: number;
    isLoading?: boolean;
    hasError?: boolean;
    onRetry?: () => void;
    className?: string;
}

const formatDate = (dateString: string) => {
    return new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "numeric",
    }).format(new Date(dateString));
};

const getIconForType = (type: ActivityEvent["type"]) => {
    switch (type) {
        case "donation":
            return <DollarSign className="w-4 h-4 text-stellar-blue" />;
        case "credit_purchase":
            return <Leaf className="w-4 h-4 text-stellar-green" />;
        case "portfolio_view":
            return <PieChart className="w-4 h-4 text-stellar-purple" />;
        case "system":
        default:
            return <Info className="w-4 h-4 text-muted-foreground" />;
    }
};

export function ActivityFeed({
    activities,
    totalDonations,
    isLoading,
    hasError,
    onRetry,
    className,
}: ActivityFeedProps) {
    return (
        <Card className={cn("h-full flex flex-col", className)}>
            <CardHeader>
                <div className="flex items-center gap-2">
                    <History className="w-5 h-5 text-stellar-blue" />
                    <CardTitle className="text-lg">Recent Activity</CardTitle>
                </div>
            </CardHeader>
            <CardContent className="flex-1 overflow-auto flex flex-col gap-6">
                {totalDonations !== undefined && !isLoading && !hasError && (
                    <div className="bg-muted/50 p-4 rounded-xl flex flex-col gap-3 border border-border/50">
                        <div className="flex items-center justify-between">
                            <Text variant="small" className="font-semibold text-stellar-purple flex items-center gap-1.5">
                                <Target className="w-4 h-4" /> Next Milestone
                            </Text>
                            <Text variant="small" className="text-muted-foreground font-medium">
                                {Math.floor(totalDonations / 5)} / {(Math.floor(Math.floor(totalDonations / 5) / 1000) + 1) * 1000} Trees
                            </Text>
                        </div>
                        <div className="h-2.5 w-full bg-secondary rounded-full overflow-hidden">
                            <div
                                className="h-full bg-stellar-purple transition-all duration-1000 ease-out rounded-full"
                                style={{ width: `${Math.min(100, Math.max(0, (Math.floor(totalDonations / 5) / ((Math.floor(Math.floor(totalDonations / 5) / 1000) + 1) * 1000)) * 100))}%` }}
                            />
                        </div>
                        <Text variant="small" className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                            <TrendingUp className="w-3.5 h-3.5 text-stellar-green" />
                            {((Math.floor(Math.floor(totalDonations / 5) / 1000) + 1) * 1000) - Math.floor(totalDonations / 5)} trees left to your next impact milestone!
                        </Text>
                    </div>
                )}

                {isLoading ? (
                    <div className="space-y-4">
                        {Array.from({ length: 5 }).map((_, i) => (
                            <div key={i} className="flex items-start gap-4">
                                <Skeleton className="h-8 w-8 rounded-full shrink-0" />
                                <div className="space-y-2 flex-1">
                                    <Skeleton className="h-4 w-3/4" />
                                    <Skeleton className="h-3 w-1/4" />
                                </div>
                            </div>
                        ))}
                    </div>
                ) : hasError ? (
                    <div className="flex flex-col items-center justify-center min-h-[200px] h-full gap-3 text-center py-8">
                        <AlertCircle className="w-8 h-8 text-destructive" />
                        <Text>Failed to load activity feed</Text>
                        {onRetry && (
                            <Button onClick={onRetry} variant="outline" size="sm">
                                Try again
                            </Button>
                        )}
                    </div>
                ) : !activities || activities.length === 0 ? (
                    <div className="flex flex-col items-center justify-center min-h-[200px] h-full gap-2 text-center py-8 text-muted-foreground">
                        <Info className="w-8 h-8 opacity-20" />
                        <Text>No recent activity</Text>
                        <Text variant="small">Your environmental impact journey begins here!</Text>
                    </div>
                ) : (
                    <div className="space-y-6">
                        {activities.map((activity) => (
                            <div key={activity.id} className="flex items-start gap-4">
                                <div className="mt-0.5 bg-muted p-2 rounded-full border border-border/50">
                                    {getIconForType(activity.type)}
                                </div>
                                <div className="flex-1 space-y-1">
                                    <Text as="p" variant="small" className="text-sm font-medium leading-tight">
                                        {activity.description}
                                    </Text>
                                    <Text as="p" variant="small" className="text-xs text-muted-foreground">
                                        {formatDate(activity.timestamp)}
                                    </Text>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
