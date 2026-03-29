'use client';

import { JSX, useEffect, useRef, useState, useCallback } from 'react';
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
  type TooltipProps,
} from 'recharts';
import { PiDownloadBold, PiCalendarBold } from 'react-icons/pi';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ChartType = 'line' | 'bar' | 'pie' | 'donut';

export interface ChartDataPoint {
  name: string;
  [key: string]: string | number;
}

export interface AnalyticsWidgetProps {
  /**
   * Chart type to display
   * @default 'line'
   */
  chartType?: ChartType;

  /**
   * Chart title
   */
  title?: string;

  /**
   * Initial data points
   */
  data: ChartDataPoint[];

  /**
   * Data keys to display (e.g., ['revenue', 'users'])
   */
  dataKeys: string[];

  /**
   * Colors for each data key
   */
  colors?: string[];

  /**
   * Enable date range selector
   * @default true
   */
  showDateRange?: boolean;

  /**
   * Enable export functionality
   * @default true
   */
  showExport?: boolean;

  /**
   * WebSocket URL for real-time updates
   */
  wsUrl?: string;

  /**
   * Callback when data is updated (real-time)
   */
  onDataUpdate?: (data: ChartDataPoint[]) => void;

  /**
   * Custom height for chart
   * @default 400
   */
  height?: number;

  /**
   * Show chart legend
   * @default true
   */
  showLegend?: boolean;

  /**
   * Responsive sizing
   * @default true
   */
  responsive?: boolean;
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/**
 * Default color palette
 */
const DEFAULT_COLORS: string[] = [
  '#3b82f6', // blue
  '#ef4444', // red
  '#10b981', // emerald
  '#f59e0b', // amber
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#14b8a6', // teal
  '#f97316', // orange
];

/**
 * Format date for display
 */
function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Filter data by date range
 */
function filterDataByDateRange(
  data: ChartDataPoint[],
  startDate: Date,
  endDate: Date,
  dateKey: string = 'date'
): ChartDataPoint[] {
  return data.filter((item) => {
    const itemDate = new Date(item[dateKey] as string);
    return itemDate >= startDate && itemDate <= endDate;
  });
}

/**
 * Export chart as PNG image
 */
async function exportChartAsPNG(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  filename: string = 'chart.png'
): Promise<void> {
  if (!canvasRef.current) {
    console.warn('Canvas reference not available for export');
    return;
  }

  try {
    const canvas = canvasRef.current as HTMLCanvasElement;
    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/png');
    link.download = filename;
    link.click();
  } catch (error) {
    console.error('Failed to export chart:', error);
  }
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

/**
 * Custom tooltip for charts
 */
function CustomTooltip(props: TooltipProps<number, string>): JSX.Element | null {
  const { active, payload, label } = props as TooltipProps<number, string> & {
    payload?: Array<{ name: string; value: number; color: string }>;
    label?: string;
  };

  if (!active || !payload) return null;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-700 dark:bg-slate-900">
      <p className="text-sm font-semibold text-slate-900 dark:text-white">{label}</p>
      {payload.map((entry: { name: string; value: number; color?: string }, index: number) => (
        <p key={`${entry.name}-${index}`} style={{ color: entry.color }} className="text-sm">
          {entry.name}: {typeof entry.value === 'number' ? entry.value.toLocaleString() : entry.value}
        </p>
      ))}
    </div>
  );
}

/**
 * Date Range Selector
 */
interface DateRangeSelectorProps {
  startDate: Date;
  endDate: Date;
  onStartDateChange: (date: Date) => void;
  onEndDateChange: (date: Date) => void;
}

function DateRangeSelector({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
}: DateRangeSelectorProps): JSX.Element {
  return (
    <div className="flex flex-col gap-3 rounded-lg bg-slate-50 p-4 dark:bg-slate-800 sm:flex-row sm:items-end">
      <div className="flex-1">
        <label htmlFor="start-date" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
          Start Date
        </label>
        <div className="relative mt-1">
          <PiCalendarBold className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
          <input
            id="start-date"
            type="date"
            value={startDate.toISOString().split('T')[0]}
            onChange={(e) => onStartDateChange(new Date(e.target.value))}
            className="block w-full rounded-md border border-slate-300 bg-white py-2 pl-10 pr-3 text-sm text-slate-900 focus:border-blue-500 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
            aria-label="Start date"
          />
        </div>
      </div>

      <div className="flex-1">
        <label htmlFor="end-date" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
          End Date
        </label>
        <div className="relative mt-1">
          <PiCalendarBold className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
          <input
            id="end-date"
            type="date"
            value={endDate.toISOString().split('T')[0]}
            onChange={(e) => onEndDateChange(new Date(e.target.value))}
            className="block w-full rounded-md border border-slate-300 bg-white py-2 pl-10 pr-3 text-sm text-slate-900 focus:border-blue-500 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
            aria-label="End date"
          />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

/**
 * Analytics Dashboard Widget
 *
 * A comprehensive charting component that supports:
 * - Multiple chart types (Line, Bar, Pie, Donut)
 * - Date range filtering
 * - Real-time WebSocket updates
 * - Chart export as PNG
 * - Responsive design
 * - Dark mode support
 * - WCAG 2.1 accessibility
 *
 * Example usage:
 * ```tsx
 * <AnalyticsWidget
 *   chartType="line"
 *   title="Revenue Trends"
 *   data={data}
 *   dataKeys={['revenue']}
 *   colors={['#3b82f6']}
 *   wsUrl="wss://api.example.com/analytics"
 *   showDateRange
 *   showExport
 * />
 * ```
 */
export function AnalyticsWidget({
  chartType = 'line',
  title = 'Analytics',
  data: initialData,
  dataKeys,
  colors = DEFAULT_COLORS,
  showDateRange = true,
  showExport = true,
  wsUrl,
  onDataUpdate,
  height = 400,
  showLegend = true,
  responsive = true,
}: AnalyticsWidgetProps): JSX.Element {
  const [data, setData] = useState<ChartDataPoint[]>(initialData);
  const [startDate, setStartDate] = useState<Date>(() => {
    const date = new Date();
    date.setDate(date.getDate() - 30);
    return date;
  });
  const [endDate, setEndDate] = useState<Date>(new Date());
  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  /**
   * Update data from initial prop
   */
  useEffect(() => {
    setData(initialData);
  }, [initialData]);

  /**
   * WebSocket connection for real-time updates
   */
  useEffect(() => {
    if (!wsUrl) return;

    try {
      const ws = new WebSocket(wsUrl);

      ws.onopen = (): void => {
        setWsConnected(true);
        console.log('Analytics WebSocket connected');
      };

      ws.onmessage = (event: MessageEvent): void => {
        try {
          const newData: ChartDataPoint[] = JSON.parse(event.data);
          setData(newData);
          onDataUpdate?.(newData);
        } catch (error) {
          console.error('Failed to parse WebSocket data:', error);
        }
      };

      ws.onerror = (): void => {
        console.error('Analytics WebSocket error');
        setWsConnected(false);
      };

      ws.onclose = (): void => {
        setWsConnected(false);
        console.log('Analytics WebSocket disconnected');
      };

      wsRef.current = ws;

      return () => {
        ws.close();
      };
    } catch (error) {
      console.error('Failed to connect to WebSocket:', error);
      setWsConnected(false);
    }
  }, [wsUrl, onDataUpdate]);

  /**
   * Filter data by selected date range
   */
  const filteredData = showDateRange
    ? filterDataByDateRange(data, startDate, endDate)
    : data;

  /**
   * Handle export
   */
  const handleExport = useCallback(async (): Promise<void> => {
    const timestamp = new Date().toISOString().split('T')[0];
    await exportChartAsPNG(canvasRef, `${title}-${timestamp}.png`);
  }, [title]);

  /**
   * Get chart colors
   */
  const chartColors = colors.slice(0, dataKeys.length);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900">
      {/* Header */}
      <div className="mb-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white">{title}</h2>
          {wsConnected && (
            <p className="mt-1 flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
              <span className="inline-block h-2 w-2 rounded-full bg-green-500" aria-hidden="true" />
              Live updates
            </p>
          )}
        </div>

        {showExport && (
          <button
            onClick={handleExport}
            className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900 active:bg-blue-800"
            aria-label="Export chart as PNG"
          >
            <PiDownloadBold className="h-4 w-4" aria-hidden="true" />
            Export
          </button>
        )}
      </div>

      {/* Date Range Selector */}
      {showDateRange && (
        <div className="mb-6">
          <DateRangeSelector
            startDate={startDate}
            endDate={endDate}
            onStartDateChange={setStartDate}
            onEndDateChange={setEndDate}
          />
        </div>
      )}

      {/* Chart Container */}
      <div
        className="relative w-full"
        role="region"
        aria-label={`${title} chart`}
        style={{ height: `${height}px` }}
      >
        <canvas
          ref={canvasRef}
          style={{ display: 'none' }}
          aria-hidden="true"
        />

        {filteredData.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-slate-500 dark:text-slate-400">No data available for the selected period</p>
          </div>
        ) : (
          <ResponsiveContainer width={responsive ? '100%' : undefined} height="100%">
            {chartType === 'line' && (
              <LineChart
                data={filteredData}
                margin={{ top: 5, right: 30, left: 0, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" stroke="#64748b" />
                <YAxis stroke="#64748b" />
                <Tooltip content={<CustomTooltip />} />
                {showLegend && <Legend />}
                {dataKeys.map((key, index) => (
                  <Line
                    key={key}
                    type="monotone"
                    dataKey={key}
                    stroke={chartColors[index]}
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={true}
                  />
                ))}
              </LineChart>
            )}

            {chartType === 'bar' && (
              <BarChart
                data={filteredData}
                margin={{ top: 5, right: 30, left: 0, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" stroke="#64748b" />
                <YAxis stroke="#64748b" />
                <Tooltip content={<CustomTooltip />} />
                {showLegend && <Legend />}
                {dataKeys.map((key, index) => (
                  <Bar
                    key={key}
                    dataKey={key}
                    fill={chartColors[index]}
                    isAnimationActive={true}
                  />
                ))}
              </BarChart>
            )}

            {(chartType === 'pie' || chartType === 'donut') && (
              <PieChart>
                <Pie
                  data={filteredData}
                  cx="50%"
                  cy="50%"
                  innerRadius={chartType === 'donut' ? 60 : 0}
                  outerRadius={100}
                  paddingAngle={2}
                  dataKey={dataKeys[0] || 'value'}
                  label={true}
                  isAnimationActive={true}
                >
                  {filteredData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={chartColors[index % chartColors.length]} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
                {showLegend && <Legend />}
              </PieChart>
            )}
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

export default AnalyticsWidget;
