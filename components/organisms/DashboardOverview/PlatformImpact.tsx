'use client';

import * as React from 'react';
import { useImpactMetrics } from '@/hooks/useImpactMetrics';
import { Counter } from '@/components/atoms/Counter';
import { Text } from '@/components/atoms/Text';
import { Card, CardContent } from '@/components/molecules/Card';
import { TreePine, HandHeart, ShieldCheck, RefreshCcw } from 'lucide-react';
import { Skeleton } from '@/components/atoms/Skeleton';

function timeAgo(date: Date): string {
  const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return date.toLocaleDateString();
}

export function PlatformImpact() {
  const { metrics, isLoading, isError, error, retry, lastUpdated } = useImpactMetrics();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex flex-col">
          <Text variant="h3" className="text-2xl font-bold tracking-tight">Global Impact</Text>
          <Text variant="muted" className="text-sm">Real-time platform-wide statistics from the Stellar network</Text>
        </div>
        {lastUpdated && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted px-2.5 py-1 rounded-full">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            Updated {timeAgo(lastUpdated)}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Trees Planted */}
        <Card className="overflow-hidden border-stellar-green/20 bg-stellar-green/5">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="p-2 rounded-lg bg-stellar-green/10 text-stellar-green">
                <TreePine size={24} />
              </div>
            </div>
            <div className="space-y-1">
              <Text variant="small" className="text-muted-foreground font-medium uppercase tracking-wider">Trees Planted</Text>
              {isLoading ? (
                <Skeleton className="h-10 w-24" />
              ) : (
                <Counter 
                  end={metrics?.treesPlanted || 0} 
                  className="text-4xl font-black text-stellar-green" 
                />
              )}
            </div>
          </CardContent>
        </Card>

        {/* Donations Received */}
        <Card className="overflow-hidden border-stellar-blue/20 bg-stellar-blue/5">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="p-2 rounded-lg bg-stellar-blue/10 text-stellar-blue">
                <HandHeart size={24} />
              </div>
            </div>
            <div className="space-y-1">
              <Text variant="small" className="text-muted-foreground font-medium uppercase tracking-wider">Donations (USDC)</Text>
              {isLoading ? (
                <Skeleton className="h-10 w-24" />
              ) : (
                <Counter 
                  end={Math.floor(metrics?.donationsReceived || 0)} 
                  prefix="$"
                  className="text-4xl font-black text-stellar-blue" 
                />
              )}
            </div>
          </CardContent>
        </Card>

        {/* Active Escrows */}
        <Card className="overflow-hidden border-amber-500/20 bg-amber-500/5">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="p-2 rounded-lg bg-amber-500/10 text-amber-600">
                <ShieldCheck size={24} />
              </div>
            </div>
            <div className="space-y-1">
              <Text variant="small" className="text-muted-foreground font-medium uppercase tracking-wider">Active Escrows</Text>
              {isLoading ? (
                <Skeleton className="h-10 w-24" />
              ) : (
                <Counter 
                  end={metrics?.activeEscrows || 0} 
                  className="text-4xl font-black text-amber-600" 
                />
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {isError && (
        <div className="p-4 bg-red-50 dark:bg-red-900/10 border border-red-200 rounded-lg flex items-center justify-between">
          <Text variant="small" className="text-red-600">Error: {error}</Text>
          <button
            onClick={() => retry()}
            className="flex items-center gap-1.5 px-3 py-1 bg-red-600 text-white text-xs font-semibold rounded-md hover:bg-red-700 transition-colors"
          >
            <RefreshCcw size={12} />
            Retry
          </button>
        </div>
      )}
    </div>
  );
}
