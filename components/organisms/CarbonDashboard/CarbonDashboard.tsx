import React from 'react';
import { CarbonChart } from './CarbonChart';
import { BadgesList, type BadgeItem } from './BadgesList';
import { SocialShareCard } from './SocialShareCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TreePine, Wind } from 'lucide-react';

// Static/Dummy Data
const mockCarbonData = [
  { date: '2023-01-01', offset_kg: 50 },
  { date: '2023-02-01', offset_kg: 55 },
  { date: '2023-03-01', offset_kg: 60 },
  { date: '2023-04-01', offset_kg: 80 },
  { date: '2023-05-01', offset_kg: 90 },
  { date: '2023-06-01', offset_kg: 105 },
  { date: '2023-07-01', offset_kg: 120 },
  { date: '2023-08-01', offset_kg: 150 },
];

const mockBadges: BadgeItem[] = [
  {
    id: 'b1',
    name: 'First Seed',
    description: 'Sponsored your very first tree on the platform.',
    iconType: 'seed',
    achieved: true,
  },
  {
    id: 'b2',
    name: 'Green Thumb',
    description: 'Sponsored 10 trees in a single month.',
    iconType: 'tree',
    achieved: true,
  },
  {
    id: 'b3',
    name: 'Forest Guardian',
    description: 'Reach a total of 100 trees sponsored.',
    iconType: 'forest',
    achieved: false,
  },
  {
    id: 'b4',
    name: 'Carbon Champion',
    description: 'Offset 1,000kg of CO2 across all your trees.',
    iconType: 'champion',
    achieved: false,
  },
];

export function CarbonDashboard() {
  // Aggregate stats from the dummy data
  const totalTrees = 28; // Hardcoded summary stat for demo
  const totalOffsetKg = mockCarbonData.reduce((acc, point) => acc + point.offset_kg, 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col md:flex-row gap-4 items-start md:items-end justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Carbon Footprint</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            Track your personal environmental impact and achievements.
          </p>
        </div>
      </div>

      {/* High Level Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Trees Sponsored</CardTitle>
            <TreePine className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalTrees}</div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">+3 this month</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total CO2 Offset</CardTitle>
            <Wind className="h-4 w-4 text-teal-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalOffsetKg.toLocaleString()} kg</div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Based on species maturity estimates
            </p>
          </CardContent>
        </Card>

        {/* Social Share Card explicitly placed in the top grid for high visibility */}
        <div className="md:col-span-1">
          <SocialShareCard totalTrees={totalTrees} totalOffsetKg={totalOffsetKg} />
        </div>
      </div>

      {/* Main Chart Area */}
      <div className="grid grid-cols-1 gap-6">
        <CarbonChart data={mockCarbonData} />
      </div>

      {/* Badges Area */}
      <div className="grid grid-cols-1 gap-6">
        <BadgesList badges={mockBadges} />
      </div>
    </div>
  );
}
