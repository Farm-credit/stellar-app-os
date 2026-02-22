import { Card, CardContent } from "@/components/molecules/Card";
import { Text } from "@/components/atoms/Text";
import { Skeleton } from "@/components/atoms/Skeleton";
import { cn } from "@/lib/utils";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/atoms/Button";

interface StatCardProps {
    title: string;
    value?: string | number;
    subValue?: string;
    isLoading?: boolean;
    hasError?: boolean;
    onRetry?: () => void;
    isPositive?: boolean;
    className?: string;
}

export function StatCard({
    title,
    value,
    subValue,
    isLoading,
    hasError,
    onRetry,
    isPositive,
    className,
}: StatCardProps) {
    return (
        <Card className={cn("overflow-hidden h-full", className)}>
            <CardContent className="p-6 h-full flex flex-col justify-center">
                <Text as="h3" variant="small" className="font-medium text-muted-foreground mb-2">
                    {title}
                </Text>

                {isLoading ? (
                    <div className="space-y-2 mt-2">
                        <Skeleton className="h-8 w-1/2" />
                        <Skeleton className="h-4 w-1/3" />
                    </div>
                ) : hasError ? (
                    <div className="flex flex-col items-start gap-2 mt-2">
                        <div className="flex items-center text-destructive">
                            <AlertCircle className="h-4 w-4 mr-2" />
                            <Text variant="small">Failed to load</Text>
                        </div>
                        {onRetry && (
                            <Button variant="outline" size="sm" onClick={onRetry} className="h-8 px-2 text-xs">
                                Retry
                            </Button>
                        )}
                    </div>
                ) : (
                    <div className="mt-2 text-stellar-blue flex-grow">
                        <Text as="h2" variant="h2" className={cn("truncate", isPositive && "text-stellar-green")}>
                            {value}
                        </Text>
                        {subValue && (
                            <Text variant="small" className="text-muted-foreground mt-1 truncate">
                                {subValue}
                            </Text>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
