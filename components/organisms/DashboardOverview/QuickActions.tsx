'use client';

import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/molecules/Card';
import { Text } from '@/components/atoms/Text';
import { cn } from '@/lib/utils';
import { Heart, ShoppingCart, BarChart3, ArrowRight } from 'lucide-react';

export function QuickActions() {
  const router = useRouter();

  const actions = [
    {
      label: 'Donate',
      icon: <Heart size={20} />,
      description: 'Support a project',
      path: '/donate',
      color: 'bg-stellar-green/10 text-stellar-green group-hover:bg-stellar-green group-hover:text-white'
    },
    {
      label: 'Buy Credits',
      icon: <ShoppingCart size={20} />,
      description: 'Offset carbon footprint',
      path: '/marketplace',
      color: 'bg-stellar-blue/10 text-stellar-blue group-hover:bg-stellar-blue group-hover:text-white'
    },
    {
      label: 'View Portfolio',
      icon: <BarChart3 size={20} />,
      description: 'Track your holdings',
      path: '/dashboard/credits',
      color: 'bg-stellar-purple/10 text-stellar-purple group-hover:bg-stellar-purple group-hover:text-white'
    }
  ];

  return (
    <Card className="flex flex-col bg-card/60 backdrop-blur-sm border-none shadow-sm rounded-3xl">
      <CardHeader className="p-10 pb-6">
        <CardTitle className="text-3xl font-black tracking-tight">Quick Actions</CardTitle>
        <CardDescription className="text-lg font-medium text-muted-foreground/70">Jump right into the action.</CardDescription>
      </CardHeader>
      <CardContent className="px-10 pb-10 space-y-5">
        {actions.map((action) => (
          <button
            key={action.label}
            onClick={() => router.push(action.path)}
            className="group flex w-full items-center justify-between p-5 rounded-3xl border border-muted/20 transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl active:scale-95 bg-muted/20 hover:bg-card hover:border-stellar-blue/30 backdrop-blur-sm"
          >
            <div className="flex items-center space-x-5">
              <div className={cn('flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl transition-all duration-300 shadow-sm', action.color)}>
                {action.icon}
              </div>
              <div className="flex flex-col text-left">
                <Text variant="body" className="font-black text-lg leading-none mb-1.5 group-hover:text-stellar-blue transition-colors">
                  {action.label}
                </Text>
                <Text variant="muted" className="text-xs font-bold tracking-tight opacity-60">
                  {action.description}
                </Text>
              </div>
            </div>
            <ArrowRight size={18} className="text-muted-foreground/40 group-hover:text-stellar-blue group-hover:translate-x-1 transition-all" />
          </button>
        ))}
      </CardContent>
    </Card>
  );
}
