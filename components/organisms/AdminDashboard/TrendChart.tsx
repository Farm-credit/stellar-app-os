"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/atoms/Button";
import type { DashboardTrendPoint } from "@/lib/types/adminDashboard";

type MetricType = "donations" | "credits";
type RangeType = "6m" | "12m";

interface TrendChartProps {
  points: DashboardTrendPoint[];
}

const CHART_WIDTH = 760;
const CHART_HEIGHT = 260;
const PADDING = 32;

function formatMetricValue(value: number, metric: MetricType): string {
  if (metric === "donations") {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(value);
  }

  return new Intl.NumberFormat("en-US").format(value);
}

export function TrendChart({ points }: TrendChartProps) {
  const [metric, setMetric] = useState<MetricType>("donations");
  const [range, setRange] = useState<RangeType>("12m");

  const filteredPoints = useMemo(() => {
    if (range === "6m") {
      return points.slice(-6);
    }

    return points;
  }, [points, range]);

  const chartData = useMemo(() => {
    const values = filteredPoints.map((point) => point[metric]);
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);
    const valueRange = Math.max(maxValue - minValue, 1);

    const innerWidth = CHART_WIDTH - PADDING * 2;
    const innerHeight = CHART_HEIGHT - PADDING * 2;
    const step = filteredPoints.length > 1 ? innerWidth / (filteredPoints.length - 1) : 0;

    const coordinates = filteredPoints.map((point, index) => {
      const rawValue = point[metric];
      const x = PADDING + index * step;
      const y = PADDING + ((maxValue - rawValue) / valueRange) * innerHeight;

      return {
        label: point.label,
        value: rawValue,
        x,
        y,
      };
    });

    const linePath = coordinates
      .map((coordinate, index) => `${index === 0 ? "M" : "L"}${coordinate.x},${coordinate.y}`)
      .join(" ");

    const areaPath =
      coordinates.length > 0
        ? `${linePath} L${coordinates[coordinates.length - 1].x},${CHART_HEIGHT - PADDING} L${coordinates[0].x},${CHART_HEIGHT - PADDING} Z`
        : "";

    const firstValue = coordinates[0]?.value ?? 0;
    const lastValue = coordinates[coordinates.length - 1]?.value ?? 0;
    const trendPercent = firstValue === 0 ? 0 : ((lastValue - firstValue) / firstValue) * 100;

    return {
      coordinates,
      areaPath,
      linePath,
      maxValue,
      minValue,
      trendPercent,
    };
  }, [filteredPoints, metric]);

  return (
    <section aria-labelledby="trend-chart-heading" className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 id="trend-chart-heading" className="text-xl font-semibold text-foreground">
            Trend charts
          </h2>
          <p className="text-sm text-muted-foreground">
            {metric === "donations" ? "Donations processed" : "Credits minted"} over time ({range})
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="inline-flex rounded-md border border-border p-1" role="group" aria-label="Chart metric toggle">
            <Button
              type="button"
              size="sm"
              variant={metric === "donations" ? "default" : "ghost"}
              aria-pressed={metric === "donations"}
              onClick={() => setMetric("donations")}
            >
              Donations
            </Button>
            <Button
              type="button"
              size="sm"
              variant={metric === "credits" ? "default" : "ghost"}
              aria-pressed={metric === "credits"}
              onClick={() => setMetric("credits")}
            >
              Credits
            </Button>
          </div>
          <div className="inline-flex rounded-md border border-border p-1" role="group" aria-label="Chart range toggle">
            <Button
              type="button"
              size="sm"
              variant={range === "6m" ? "outline" : "ghost"}
              aria-pressed={range === "6m"}
              onClick={() => setRange("6m")}
            >
              6M
            </Button>
            <Button
              type="button"
              size="sm"
              variant={range === "12m" ? "outline" : "ghost"}
              aria-pressed={range === "12m"}
              onClick={() => setRange("12m")}
            >
              12M
            </Button>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4 sm:p-6">
        <svg
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          className="h-[260px] w-full"
          role="img"
          aria-labelledby="trend-chart-title trend-chart-description"
        >
          <title id="trend-chart-title">Admin trend chart for {metric}</title>
          <desc id="trend-chart-description">
            Line chart displaying {metric} trend for the selected {range} range.
          </desc>

          <line
            x1={PADDING}
            y1={CHART_HEIGHT - PADDING}
            x2={CHART_WIDTH - PADDING}
            y2={CHART_HEIGHT - PADDING}
            className="stroke-border"
            strokeWidth="1"
          />

          <line
            x1={PADDING}
            y1={PADDING}
            x2={PADDING}
            y2={CHART_HEIGHT - PADDING}
            className="stroke-border"
            strokeWidth="1"
          />

          {chartData.areaPath ? (
            <path d={chartData.areaPath} className="fill-stellar-blue/10" />
          ) : null}
          {chartData.linePath ? (
            <path
              d={chartData.linePath}
              className="stroke-stellar-blue fill-none"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}

          {chartData.coordinates.map((coordinate) => (
            <g key={`${coordinate.label}-${coordinate.value}`}>
              <circle
                cx={coordinate.x}
                cy={coordinate.y}
                r="4.5"
                className="fill-stellar-blue stroke-background"
                strokeWidth="2"
              />
              <text
                x={coordinate.x}
                y={CHART_HEIGHT - 10}
                textAnchor="middle"
                className="fill-muted-foreground text-[11px]"
              >
                {coordinate.label}
              </text>
            </g>
          ))}
        </svg>

        <div className="mt-4 grid gap-2 border-t border-border pt-4 text-sm text-muted-foreground sm:grid-cols-3">
          <p>
            Min: <span className="font-medium text-foreground">{formatMetricValue(chartData.minValue, metric)}</span>
          </p>
          <p>
            Max: <span className="font-medium text-foreground">{formatMetricValue(chartData.maxValue, metric)}</span>
          </p>
          <p>
            Trend: <span className="font-medium text-foreground">{chartData.trendPercent.toFixed(1)}%</span>
          </p>
        </div>
      </div>
    </section>
  );
}
