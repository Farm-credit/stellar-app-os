'use client';

import type { ReactNode } from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  type PieLabelRenderProps,
} from 'recharts';
import type { AnalyticsChartType, AnalyticsDataset } from '@/lib/types/analytics';

const CHART_COLORS = {
  users: '#14b6e7',
  transactions: '#3e1bdb',
  revenue: '#00b36b',
} as const;

const pieLabel = ({ name, percent }: PieLabelRenderProps) =>
  `${name ?? ''} ${((percent ?? 0) * 100).toFixed(0)}%`;

interface ChartRendererProps {
  activeChart: AnalyticsChartType;
  dataset: AnalyticsDataset;
}

export function ChartRenderer({ activeChart, dataset }: ChartRendererProps): ReactNode {
  const { timeSeries, donationCategories, projectStatus } = dataset;

  switch (activeChart) {
    case 'line':
      return (
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={timeSeries} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11 }}
              tickFormatter={(v: string) => v.slice(5)}
            />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Legend />
            <Line
              type="monotone"
              dataKey="users"
              stroke={CHART_COLORS.users}
              dot={false}
              strokeWidth={2}
            />
            <Line
              type="monotone"
              dataKey="transactions"
              stroke={CHART_COLORS.transactions}
              dot={false}
              strokeWidth={2}
            />
            <Line
              type="monotone"
              dataKey="revenue"
              stroke={CHART_COLORS.revenue}
              dot={false}
              strokeWidth={2}
            />
          </LineChart>
        </ResponsiveContainer>
      );

    case 'bar':
      return (
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={timeSeries} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11 }}
              tickFormatter={(v: string) => v.slice(5)}
            />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Legend />
            <Bar dataKey="users" fill={CHART_COLORS.users} radius={[3, 3, 0, 0]} />
            <Bar dataKey="transactions" fill={CHART_COLORS.transactions} radius={[3, 3, 0, 0]} />
            <Bar dataKey="revenue" fill={CHART_COLORS.revenue} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      );

    case 'pie':
      return (
        <ResponsiveContainer width="100%" height={320}>
          <PieChart>
            <Pie
              data={donationCategories}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius={120}
              label={pieLabel}
            >
              {donationCategories.map((slice) => (
                <Cell
                  key={slice.name}
                  fill={slice.fill}
                  aria-label={`${slice.name}: ${slice.value}`}
                />
              ))}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      );

    case 'donut':
      return (
        <ResponsiveContainer width="100%" height={320}>
          <PieChart>
            <Pie
              data={projectStatus}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={70}
              outerRadius={120}
              label={pieLabel}
            >
              {projectStatus.map((slice) => (
                <Cell
                  key={slice.name}
                  fill={slice.fill}
                  aria-label={`${slice.name}: ${slice.value}`}
                />
              ))}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      );
  }
}
