import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Sprout, TreePine, Leaf, Trophy } from 'lucide-react';

export interface BadgeItem {
  id: string;
  name: string;
  description: string;
  iconType: 'seed' | 'tree' | 'forest' | 'champion';
  achieved: boolean;
  dateAchieved?: string;
}

interface BadgesListProps {
  badges: BadgeItem[];
}

const iconMap = {
  seed: <Sprout className="w-8 h-8" />,
  tree: <TreePine className="w-8 h-8" />,
  forest: <Leaf className="w-8 h-8" />,
  champion: <Trophy className="w-8 h-8" />,
};

export function BadgesList({ badges }: BadgesListProps) {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Accomplishments</CardTitle>
        <CardDescription>Badges earned for your environmental impact.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {badges.map((badge) => (
            <div
              key={badge.id}
              className={`flex flex-col items-center p-4 rounded-lg border transition-colors ${
                badge.achieved
                  ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-800'
                  : 'bg-slate-50 border-slate-200 opacity-60 dark:bg-slate-900 dark:border-slate-800'
              }`}
            >
              <div
                className={`mb-3 p-3 rounded-full ${
                  badge.achieved
                    ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900 dark:text-emerald-400'
                    : 'bg-slate-200 text-slate-400 dark:bg-slate-800 dark:text-slate-500'
                }`}
              >
                {iconMap[badge.iconType] || <Trophy className="w-8 h-8" />}
              </div>
              <h4 className="font-semibold text-center text-sm mb-1">{badge.name}</h4>
              <p className="text-xs text-center text-slate-500 dark:text-slate-400 mb-2">
                {badge.description}
              </p>
              {badge.achieved ? (
                <Badge variant="default" className="bg-emerald-500 hover:bg-emerald-600">
                  Earned
                </Badge>
              ) : (
                <Badge variant="outline">Locked</Badge>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
