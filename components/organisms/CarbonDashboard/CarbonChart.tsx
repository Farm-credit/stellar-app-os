'use client';

import React, { useMemo } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface CarbonDataPoint {
  date: string;
  offset_kg: number;
}

interface CarbonChartProps {
  data: CarbonDataPoint[];
}

export function CarbonChart({ data }: CarbonChartProps) {
  // O(N) Time / O(N) Space complexity optimization via useMemo
  // Prevents re-calculation/re-allocation on re-renders when data hasn't changed.
  const chartData = useMemo(() => {
    return data.reduce<
      Array<{
        date: string;
        rawDate: string;
        daily_offset: number;
        cumulative_offset: number;
      }>
    >((acc, point) => {
      const prevCumulative = acc.length > 0 ? acc[acc.length - 1].cumulative_offset : 0;
      const cumulativeOffset = prevCumulative + point.offset_kg;
      acc.push({
        date: new Date(point.date).toLocaleDateString(undefined, {
          month: 'short',
          year: 'numeric',
        }),
        rawDate: point.date, // Keep for sorting if needed, though assumed sorted
        daily_offset: point.offset_kg,
        cumulative_offset: cumulativeOffset,
      });
      return acc;
    }, []);
  }, [data]);

  return (
    <Card className="w-full h-full">
      <CardHeader>
        <CardTitle>Carbon Offset Projection</CardTitle>
        <CardDescription>Your cumulative carbon footprint reduction over time.</CardDescription>
      </CardHeader>
      <CardContent className="h-[300px]">
        {chartData.length === 0 ? (
          <div className="flex items-center justify-center h-full text-slate-500">
            No data available.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorOffset" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis
                dataKey="date"
                stroke="#64748b"
                fontSize={12}
                tickLine={false}
                axisLine={false}
                minTickGap={30}
              />
              <YAxis
                stroke="#64748b"
                fontSize={12}
                tickLine={false}
                axisLine={false}
                tickFormatter={(val) => `${val}kg`}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: '8px',
                  border: 'none',
                  boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                }}
                formatter={(value) => {
                  if (value === undefined || value === null) return ['— kg', 'Total Offset'];
                  return [`${value} kg`, 'Total Offset'];
                }}
              />
              <Area
                type="monotone"
                dataKey="cumulative_offset"
                stroke="#10b981"
                strokeWidth={3}
                fillOpacity={1}
                fill="url(#colorOffset)"
                isAnimationActive={true}
                animationDuration={1500}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
