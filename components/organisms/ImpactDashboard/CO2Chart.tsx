/**
 * CO2Chart Molecule Component
 *
 * Time-series area chart visualizing CO2 offset over time.
 * Uses Recharts with full accessibility support.
 */

"use client";

import { formatChartDate, formatNumber } from "@/lib/Impact-utils";
import { CO2DataPoint } from "@/types/impact.types";
import { useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  type TooltipContentProps, // ✅ Changed from TooltipProps
} from "recharts";
import type {
  ValueType,
  NameType,
} from "recharts/types/component/DefaultTooltipContent";

interface CO2ChartProps {
  data: CO2DataPoint[];
  height?: number;
}

// ✅ TooltipContentProps (not TooltipProps) — this is what has payload/active
function CustomTooltip({
  active,
  payload,
}: TooltipContentProps<ValueType, NameType>) {
  if (!active || !payload || payload.length === 0) return null;

  const data = payload[0].payload as CO2DataPoint & { displayDate: string };

  return (
    <div className="bg-card/95 backdrop-blur-sm border border-border rounded-xl shadow-xl p-4">
      <p className="text-xs font-medium text-muted-foreground mb-2">
        {data.displayDate}
      </p>
      <div className="space-y-1">
        <p className="text-sm font-bold text-foreground">
          {formatNumber(data.co2Offset)} kg CO₂
        </p>
        <p className="text-xs text-muted-foreground">
          Total: {formatNumber(data.cumulative)} kg
        </p>
      </div>
    </div>
  );
}

export function CO2Chart({ data, height = 320 }: CO2ChartProps) {
  // Transform and memoize chart data
  const chartData = useMemo(() => {
    return data.map((point) => ({
      ...point,
      displayDate: formatChartDate(point.date),
    }));
  }, [data]);

  // Empty state
  if (!data || data.length === 0) {
    return (
      <div
        className="flex items-center justify-center bg-linear-to-br from-muted/30 to-muted/10 rounded-2xl border border-dashed border-border/50"
        style={{ height }}
        role="img"
        aria-label="No CO2 data available"
      >
        <p className="text-muted-foreground text-sm font-medium">
          No data available yet. Start your impact journey!
        </p>
      </div>
    );
  }

  const totalCO2 = data[data.length - 1].cumulative;

  return (
    <div className="w-full" role="img" aria-label="CO2 offset over time chart">
      {/* Screen reader alternative */}
      <div className="sr-only">
        CO2 offset chart showing {data.length} months of data. Total CO2 offset:{" "}
        {formatNumber(totalCO2)} kilograms. Data ranges from{" "}
        {formatChartDate(data[0].date)} to{" "}
        {formatChartDate(data[data.length - 1].date)}.
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart
          data={chartData}
          margin={{ top: 10, right: 20, left: 0, bottom: 0 }}
        >
          {/* Gradient definition */}
          <defs>
            <linearGradient id="colorCO2" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#14B6E7" stopOpacity={0.4} />
              <stop offset="95%" stopColor="#14B6E7" stopOpacity={0.05} />
            </linearGradient>
          </defs>

          {/* Grid */}
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="hsl(var(--border))"
            opacity={0.2}
            vertical={false}
          />

          {/* X Axis */}
          <XAxis
            dataKey="displayDate"
            stroke="hsl(var(--muted-foreground))"
            fontSize={12}
            fontWeight={500}
            tickLine={false}
            axisLine={{ stroke: "hsl(var(--border))" }}
          />

          {/* Y Axis */}
          <YAxis
            stroke="hsl(var(--muted-foreground))"
            fontSize={12}
            fontWeight={500}
            tickLine={false}
            axisLine={{ stroke: "hsl(var(--border))" }}
            tickFormatter={(value) => formatNumber(value)}
          />

          {/* Tooltip */}
          <Tooltip
            content={CustomTooltip}
            cursor={{
              stroke: "#14B6E7",
              strokeWidth: 2,
              strokeDasharray: "5 5",
            }}
          />

          {/* Area */}
          <Area
            type="monotone"
            dataKey="co2Offset"
            stroke="#14B6E7"
            strokeWidth={3}
            fill="url(#colorCO2)"
            animationDuration={1500}
            animationEasing="ease-in-out"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
