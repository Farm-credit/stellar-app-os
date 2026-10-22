'use client';

import { Activity, Info } from 'lucide-react';
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Legend,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/molecules/Card';
import { Badge } from '@/components/atoms/Badge';
import { Text } from '@/components/atoms/Text';
import { getMockProjectSoilHealthData } from '@/lib/api/mock/projectSoilHealth';

interface SoilHealthSectionProps {
  projectId: string;
}

const chartMetrics = [
  { key: 'ph', label: 'pH', max: 14 },
  { key: 'nitrogenMgKg', label: 'Nitrogen', max: 400 },
  { key: 'moisturePercent', label: 'Moisture', max: 50 },
  { key: 'organicMatterPercent', label: 'Organic matter', max: 10 },
] as const;

const formatDate = (date: string) =>
  new Date(`${date}T00:00:00`).toLocaleDateString('en', { month: 'short', year: 'numeric' });

const formatValue = (key: (typeof chartMetrics)[number]['key'], value: number) => {
  if (key === 'ph') return value.toFixed(1);
  if (key === 'nitrogenMgKg') return `${value} mg/kg`;
  return `${value}%`;
};

export function SoilHealthSection({ projectId }: SoilHealthSectionProps) {
  const data = getMockProjectSoilHealthData(projectId);

  return (
    <section id="soil-health" aria-labelledby="soil-health-title">
      <Text id="soil-health-title" variant="h3" className="mb-6 flex items-center gap-2 font-bold">
        Soil Health
        <div className="h-px flex-1 bg-stellar-blue/20" />
      </Text>

      {!data ? (
        <Card>
          <CardContent className="flex items-center gap-3 p-6">
            <Info className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
            <Text variant="muted">
              No soil health measurements are available for this project yet.
            </Text>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-stellar-green" aria-hidden="true" />
                Soil indicators over time
              </CardTitle>
              <Text variant="muted" className="mt-2 text-sm">
                Source: {data.source}
              </Text>
            </div>
            <Badge variant="outline">
              {data.isSampleData ? 'Sample data' : 'Field measurements'}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-6">
            {data.isSampleData && (
              <div
                role="note"
                className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-muted-foreground"
              >
                Illustrative values only. These are not verified soil test results or actual project
                measurements.
              </div>
            )}

            <div className="h-72 w-full" aria-label="Radar chart comparing soil indicators">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart
                  data={chartMetrics.map((metric) => ({
                    subject: metric.label,
                    Previous: (data.readings[0][metric.key] / metric.max) * 100,
                    Current:
                      (data.readings[data.readings.length - 1][metric.key] / metric.max) * 100,
                  }))}
                >
                  <PolarGrid />
                  <PolarAngleAxis dataKey="subject" />
                  <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} />
                  <Tooltip formatter={(value) => `${Number(value).toFixed(0)}% of scale`} />
                  <Legend />
                  <Radar
                    name={formatDate(data.readings[0].date)}
                    dataKey="Previous"
                    stroke="var(--color-stellar-cyan)"
                    fill="var(--color-stellar-cyan)"
                    fillOpacity={0.15}
                  />
                  <Radar
                    name={formatDate(data.readings[data.readings.length - 1].date)}
                    dataKey="Current"
                    stroke="var(--color-stellar-green)"
                    fill="var(--color-stellar-green)"
                    fillOpacity={0.25}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] text-left text-sm">
                <caption className="sr-only">Historical soil health readings</caption>
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th scope="col" className="py-2 pr-4 font-medium">
                      Indicator
                    </th>
                    <th scope="col" className="py-2 pr-4 font-medium">
                      {formatDate(data.readings[0].date)}
                    </th>
                    <th scope="col" className="py-2 pr-4 font-medium">
                      {formatDate(data.readings[data.readings.length - 1].date)}
                    </th>
                    <th scope="col" className="py-2 font-medium">
                      Change
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {chartMetrics.map((metric) => {
                    const previous = data.readings[0][metric.key];
                    const current = data.readings[data.readings.length - 1][metric.key];
                    const change = current - previous;

                    return (
                      <tr key={metric.key} className="border-b last:border-0">
                        <th scope="row" className="py-3 pr-4 font-medium">
                          {metric.label}
                        </th>
                        <td className="py-3 pr-4">{formatValue(metric.key, previous)}</td>
                        <td className="py-3 pr-4">{formatValue(metric.key, current)}</td>
                        <td className="py-3 text-stellar-green">
                          {change > 0 ? '+' : ''}
                          {formatValue(metric.key, change)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </section>
  );
}
