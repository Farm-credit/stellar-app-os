import React from 'react';
import { LineChart, Line, ResponsiveContainer, YAxis } from 'recharts';
import { LucideIcon } from 'lucide-react';

interface TelemetryCardProps {
  title: string;
  value: string;
  unit: string;
  icon: LucideIcon;
  status: 'good' | 'warning' | 'danger';
  trendData: { value: number }[];
  lastUpdate: string;
}

const getStatusStyles = (status: 'good' | 'warning' | 'danger') => {
  switch (status) {
    case 'good':
      return {
        bg: 'bg-green-50',
        border: 'border-green-200',
        icon: 'text-green-600',
        line: '#22c55e',
        badge: 'bg-green-100 text-green-700',
      };
    case 'warning':
      return {
        bg: 'bg-yellow-50',
        border: 'border-yellow-200',
        icon: 'text-yellow-600',
        line: '#eab308',
        badge: 'bg-yellow-100 text-yellow-700',
      };
    case 'danger':
      return {
        bg: 'bg-red-50',
        border: 'border-red-200',
        icon: 'text-red-600',
        line: '#ef4444',
        badge: 'bg-red-100 text-red-700',
      };
  }
};

export const TelemetryCard: React.FC<TelemetryCardProps> = ({
  title,
  value,
  unit,
  icon: Icon,
  status,
  trendData,
  lastUpdate,
}) => {
  const styles = getStatusStyles(status);

  return (
    <div className={`${styles.bg} ${styles.border} border rounded-xl p-5 transition-all hover:shadow-md`}>
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg bg-white ${styles.icon}`}>
            <Icon className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-medium text-gray-600">{title}</h3>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-2xl font-bold text-gray-900">{value}</span>
              <span className="text-sm text-gray-500">{unit}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="h-16 mb-3 -mx-2" style={{ minHeight: '64px' }}>
        <ResponsiveContainer width="100%" height={64}>
          <LineChart data={trendData}>
            <YAxis hide domain={['dataMin - 5', 'dataMax + 5']} />
            <Line
              type="monotone"
              dataKey="value"
              stroke={styles.line}
              strokeWidth={2}
              dot={false}
              animationDuration={300}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500">Last update: {lastUpdate}</span>
        <span className={`text-xs px-2 py-1 rounded-full ${styles.badge}`}>
          {status === 'good' ? 'Normal' : status === 'warning' ? 'Monitor' : 'Alert'}
        </span>
      </div>
    </div>
  );
};