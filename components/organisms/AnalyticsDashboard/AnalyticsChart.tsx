'use client';

import { type JSX, useMemo } from 'react';
import { cn } from '@/lib/utils';

export interface ChartDataPoint {
  label: string;
  value: number;
}

export interface AnalyticsChartProps {
  title: string;
  data: ChartDataPoint[];
  color?: string;
  height?: number;
  className?: string;
  loading?: boolean;
  type?: 'line' | 'bar';
}

const CHART_PADDING = 40;

export function AnalyticsChart({
  title,
  data,
  color = 'stroke-stellar-blue',
  height = 300,
  className,
  loading = false,
  type = 'line',
}: AnalyticsChartProps): JSX.Element {
  const chartData = useMemo(() => {
    if (data.length === 0) {
      return { coordinates: [], linePath: '', areaPath: '', maxValue: 0, minValue: 0 };
    }

    const values = data.map((point) => point.value);
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);
    const valueRange = Math.max(maxValue - minValue, 1);

    const innerWidth = 800 - CHART_PADDING * 2;
    const innerHeight = height - CHART_PADDING * 2;
    const step = data.length > 1 ? innerWidth / (data.length - 1) : 0;

    const coordinates = data.map((point, index) => {
      const x = CHART_PADDING + index * step;
      const y = CHART_PADDING + ((maxValue - point.value) / valueRange) * innerHeight;

      return {
        label: point.label,
        value: point.value,
        x,
        y,
      };
    });

    let linePath = '';
    let areaPath = '';

    if (type === 'line') {
      linePath = coordinates
        .map((coordinate, index) => `${index === 0 ? 'M' : 'L'}${coordinate.x},${coordinate.y}`)
        .join(' ');

      areaPath =
        coordinates.length > 0
          ? `${linePath} L${coordinates[coordinates.length - 1].x},${height - CHART_PADDING} L${coordinates[0].x},${height - CHART_PADDING} Z`
          : '';
    }

    return {
      coordinates,
      linePath,
      areaPath,
      maxValue,
      minValue,
    };
  }, [data, height, type]);

  if (loading) {
    return (
      <div className={cn('rounded-xl border border-border bg-card p-6', className)}>
        <div className="animate-pulse space-y-4">
          <div className="h-6 w-1/3 rounded bg-muted" />
          <div className="h-[300px] w-full rounded bg-muted" />
        </div>
      </div>
    );
  }

  return (
    <div className={cn('rounded-xl border border-border bg-card p-6', className)}>
      <h3 className="mb-4 text-lg font-semibold text-foreground">{title}</h3>

      {data.length === 0 ? (
        <div className="flex h-[300px] items-center justify-center text-muted-foreground">
          No data available
        </div>
      ) : (
        <svg
          viewBox={`0 0 800 ${height}`}
          className="h-[300px] w-full"
          role="img"
          aria-labelledby={`chart-title-${title.replace(/\s+/g, '-')} chart-desc-${title.replace(/\s+/g, '-')}`}
        >
          <title id={`chart-title-${title.replace(/\s+/g, '-')}`}>{title}</title>
          <desc id={`chart-desc-${title.replace(/\s+/g, '-')}`}>
            {type === 'line' ? 'Line chart' : 'Bar chart'} displaying {title.toLowerCase()}
          </desc>

          {[0, 0.25, 0.5, 0.75, 1].map((percent) => {
            const y = CHART_PADDING + (height - CHART_PADDING * 2) * (1 - percent);
            return (
              <line
                key={percent}
                x1={CHART_PADDING}
                y1={y}
                x2={800 - CHART_PADDING}
                y2={y}
                className="stroke-border"
                strokeWidth="1"
                strokeDasharray="4 4"
              />
            );
          })}

          <line
            x1={CHART_PADDING}
            y1={height - CHART_PADDING}
            x2={800 - CHART_PADDING}
            y2={height - CHART_PADDING}
            className="stroke-border"
            strokeWidth="2"
          />
          <line
            x1={CHART_PADDING}
            y1={CHART_PADDING}
            x2={CHART_PADDING}
            y2={height - CHART_PADDING}
            className="stroke-border"
            strokeWidth="2"
          />

          {type === 'line' ? (
            <>
              {chartData.areaPath && (
                <path d={chartData.areaPath} className="fill-stellar-blue/10" />
              )}
              {chartData.linePath && (
                <path
                  d={chartData.linePath}
                  className={cn('fill-none', color)}
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}
              {chartData.coordinates.map((coordinate) => (
                <g key={`${coordinate.label}-${coordinate.value}`}>
                  <circle
                    cx={coordinate.x}
                    cy={coordinate.y}
                    r="5"
                    className="fill-stellar-blue stroke-background"
                    strokeWidth="2"
                  />
                  <text
                    x={coordinate.x}
                    y={height - 20}
                    textAnchor="middle"
                    className="fill-muted-foreground text-[11px]"
                  >
                    {coordinate.label}
                  </text>
                </g>
              ))}
            </>
          ) : (
            <>
              {chartData.coordinates.map((coordinate) => {
                const barWidth = ((800 - CHART_PADDING * 2) / data.length) * 0.6;
                const barHeight = height - CHART_PADDING * 2 - (coordinate.y - CHART_PADDING);
                return (
                  <g key={`${coordinate.label}-${coordinate.value}`}>
                    <rect
                      x={coordinate.x - barWidth / 2}
                      y={coordinate.y}
                      width={barWidth}
                      height={barHeight}
                      className="fill-stellar-blue hover:fill-stellar-purple transition-colors"
                      rx="4"
                    />
                    <text
                      x={coordinate.x}
                      y={height - 20}
                      textAnchor="middle"
                      className="fill-muted-foreground text-[11px]"
                    >
                      {coordinate.label}
                    </text>
                  </g>
                );
              })}
            </>
          )}
        </svg>
      )}

      <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
        <div className="flex gap-4">
          <span>Min: {chartData.minValue.toLocaleString()}</span>
          <span>Max: {chartData.maxValue.toLocaleString()}</span>
        </div>
        <span>Total: {data.reduce((sum, point) => sum + point.value, 0).toLocaleString()}</span>
      </div>
    </div>
  );
}
