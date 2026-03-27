'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/molecules/Card';
import { Text } from '@/components/atoms/Text';
import { cn } from '@/lib/utils';
import type { UserActivity } from '@/types/user-dashboard';
import { TreePine, ShoppingBag, ShieldCheck, Eye, Layers } from 'lucide-react';

interface RecentActivityProps {
  activities?: UserActivity[];
}

export function RecentActivity({ activities }: RecentActivityProps) {
  if (!activities || activities.length === 0) {
    return (
      <Card className="flex h-full flex-col justify-center items-center p-12 text-center bg-card/60 backdrop-blur-sm border-none shadow-sm rounded-3xl min-h-[500px]">
        <div className="flex h-24 w-24 items-center justify-center rounded-3xl bg-stellar-blue/10 text-stellar-blue mb-8 rotate-3 transition-transform hover:rotate-0 duration-500 shadow-inner">
          <Layers size={48} />
        </div>
        <CardTitle className="text-3xl font-black mb-4 tracking-tight">Welcome home!</CardTitle>
        <CardDescription className="max-w-md mx-auto text-lg text-muted-foreground/80 leading-relaxed font-medium">
          Your environmental impact starts here. Plant trees, buy credits, or retire holdings to see your journey unfold.
        </CardDescription>
        <button className="mt-10 rounded-full bg-stellar-blue px-10 py-4 font-bold text-white transition-all hover:bg-stellar-blue/90 hover:scale-105 active:scale-95 shadow-xl shadow-stellar-blue/30">
          Start Your Impact
        </button>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col h-full bg-card/60 backdrop-blur-sm border-none shadow-sm rounded-3xl">
      <CardHeader className="p-10 pb-6">
        <CardTitle className="text-3xl font-black tracking-tight">Recent Activity</CardTitle>
        <CardDescription className="text-lg font-medium text-muted-foreground/70">Track your latest environmental positive actions.</CardDescription>
      </CardHeader>
      <CardContent className="px-10 pb-10 overflow-y-auto max-h-[600px] custom-scrollbar">
        <div className="space-y-10 pt-4">
          {activities.map((activity, idx) => (
            <div key={activity.id} className="relative flex items-start space-x-6 group">
              {/* Vertical line indicator */}
              {idx < activities.length - 1 && (
                <div className="absolute left-[23px] top-10 w-0.5 h-[calc(100%+24px)] bg-muted/40 group-hover:bg-stellar-blue/20 transition-colors" />
              )}
              
              <div
                className={cn(
                  'z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ring-8 ring-background/50 transition-all duration-300 group-hover:scale-110 shadow-sm',
                  getActivityColor(activity.type)
                )}
              >
                {getActivityIcon(activity.type)}
              </div>
              <div className="flex-1 space-y-2">
                <div className="flex items-center justify-between">
                  <Text variant="body" className="text-lg font-extrabold tracking-tight group-hover:text-stellar-blue transition-colors">
                    {activity.title}
                  </Text>
                  <Text variant="muted" className="text-[11px] font-bold uppercase tracking-[0.1em] opacity-40">
                    {formatTimestamp(activity.timestamp)}
                  </Text>
                </div>
                <Text variant="small" className="text-muted-foreground/80 leading-relaxed max-w-xl font-medium">
                  {activity.description}
                </Text>
                {activity.amount && (
                  <div className="flex items-center space-x-2 mt-4">
                    <div className="px-3.5 py-1.5 rounded-xl bg-muted/60 text-[12px] font-black text-muted-foreground uppercase tracking-wider">
                      {activity.amount} {activity.unit}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function getActivityIcon(type: string) {
  const iconSize = 20;
  switch (type) {
    case 'donation':
      return <TreePine size={iconSize} />;
    case 'credit_purchase':
      return <ShoppingBag size={iconSize} />;
    case 'credit_retirement':
      return <ShieldCheck size={iconSize} />;
    case 'portfolio_view':
      return <Eye size={iconSize} />;
    default:
      return null;
  }
}

function getActivityColor(type: string) {
  switch (type) {
    case 'donation':
      return 'bg-stellar-green text-white';
    case 'credit_purchase':
      return 'bg-stellar-blue text-white';
    case 'credit_retirement':
      return 'bg-stellar-purple text-white';
    case 'portfolio_view':
      return 'bg-stellar-cyan text-white';
    default:
      return 'bg-muted text-muted-foreground';
  }
}

function formatTimestamp(timestamp: string) {
  const date = new Date(timestamp);
  const now = new Date();
  const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
  const diffInHours = Math.floor(diffInMinutes / 60);
  const diffInDays = Math.floor(diffInHours / 24);

  if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
  if (diffInHours < 24) return `${diffInHours}h ago`;
  if (diffInDays < 7) return `${diffInDays}d ago`;
  
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function RecentActivitySkeleton() {
  return (
    <Card className="flex flex-col bg-card animate-pulse border-none shadow-sm rounded-3xl overflow-hidden h-[500px]">
      <CardHeader className="p-8 pb-4">
        <div className="h-8 w-40 bg-muted/60 rounded mb-2"></div>
        <div className="h-4 w-60 bg-muted/40 rounded"></div>
      </CardHeader>
      <CardContent className="p-8">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex space-x-4 mb-8">
            <div className="h-7 w-7 bg-muted/50 rounded-full shrink-0"></div>
            <div className="flex-1 space-y-2">
              <div className="flex justify-between">
                <div className="h-4 w-1/3 bg-muted/50 rounded"></div>
                <div className="h-3 w-16 bg-muted/30 rounded"></div>
              </div>
              <div className="h-4 w-full bg-muted/30 rounded"></div>
              <div className="h-6 w-20 bg-muted/20 rounded"></div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
