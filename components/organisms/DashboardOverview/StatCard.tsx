'use client';

import { Card, CardContent } from '@/components/molecules/Card';
import { Text } from '@/components/atoms/Text';
import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';

interface StatCardProps {
  label: string;
  value: string;
  subValue?: string;
  icon?: React.ReactNode;
  positive?: boolean;
}

export function StatCard({ label, value, subValue, icon, positive }: StatCardProps) {
  return (
    <Card className="relative overflow-hidden group border-none shadow-sm transition-all duration-300 hover:shadow-xl hover:-translate-y-1 bg-card/60 backdrop-blur-sm rounded-3xl">
      {/* Accent bar */}
      <div className="absolute top-0 left-0 w-full h-1 bg-stellar-blue/30 group-hover:bg-stellar-blue transition-colors duration-300" />
      
      <CardContent className="p-8">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Text variant="muted" className="text-xs font-bold uppercase tracking-widest opacity-70">
              {label}
            </Text>
            <div className="flex flex-col">
              <Text variant="h3" className="text-3xl font-black tracking-tight leading-none mb-1">
                {value}
              </Text>
              {subValue && (
                <Text variant="small" className={cn('text-xs font-bold leading-none', positive ? 'text-stellar-green' : 'text-muted-foreground/60')}>
                  {subValue}
                </Text>
              )}
            </div>
          </div>
          {icon && (
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-stellar-blue/10 text-stellar-blue transition-transform duration-300 group-hover:scale-110 group-hover:bg-stellar-blue group-hover:text-white">
              {icon}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function StatCardSkeleton() {
  return (
    <Card className="h-[104px] animate-pulse border-none bg-muted/20">
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-4 w-20 rounded bg-muted"></div>
            <div className="h-8 w-24 rounded bg-muted"></div>
          </div>
          <div className="h-12 w-12 rounded-xl bg-muted"></div>
        </div>
      </CardContent>
    </Card>
  );
}
