'use client';

import { useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  calculateEcosystemScore,
  type EcosystemMetrics,
} from '@/lib/impact/forest-ecosystem-score';

interface ForestEcosystemHealthProps {
  metrics: EcosystemMetrics;
  // Mock quarterly data for the chart - you will eventually fetch this from the DB
  historyData?: { quarter: string; score: number }[];
}

export default function ForestEcosystemHealth({
  metrics,
  historyData = [
    { quarter: 'Q1 2024', score: 65 },
    { quarter: 'Q2 2024', score: 72 },
    { quarter: 'Q3 2024', score: 78 },
    { quarter: 'Q4 2024', score: 82 },
  ],
}: ForestEcosystemHealthProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const { totalScore, breakdown } = calculateEcosystemScore(metrics);

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600 bg-green-50 border-green-200';
    if (score >= 50) return 'text-yellow-600 bg-yellow-50 border-yellow-200';
    return 'text-red-600 bg-red-50 border-red-200';
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 flex flex-col gap-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Forest Ecosystem Health</h2>
          <p className="text-sm text-gray-500 mt-1">
            Composite score based on survival, diversity, wildlife, and soil.
          </p>
        </div>

        {/* Score Display with Tooltip */}
        <div className="relative">
          <div
            className={`px-4 py-2 rounded-full border font-bold text-2xl cursor-help transition-colors ${getScoreColor(totalScore)}`}
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
          >
            {totalScore} <span className="text-sm font-normal opacity-70">/ 100</span>
          </div>

          {/* Tooltip Breakdown */}
          {showTooltip && (
            <div className="absolute right-0 top-full mt-2 w-72 bg-gray-900 text-white text-sm rounded-lg p-4 shadow-xl z-50">
              <h4 className="font-semibold mb-2 border-b border-gray-700 pb-1">Score Breakdown</h4>
              <ul className="space-y-2">
                {breakdown.map((item) => (
                  <li key={item.label} className="flex justify-between items-center">
                    <span className="text-gray-300">
                      {item.label} ({item.weight}%)
                    </span>
                    <span className="font-mono">{Math.round(item.contribution)} pts</span>
                  </li>
                ))}
              </ul>
              <div className="mt-2 pt-2 border-t border-gray-700 flex justify-between font-bold">
                <span>Total</span>
                <span>{totalScore}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* History Chart */}
      <div className="h-48 w-full mt-4">
        <h3 className="text-sm font-medium text-gray-700 mb-2">Quarterly History</h3>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={historyData}>
            <XAxis
              dataKey="quarter"
              stroke="#9ca3af"
              fontSize={12}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              domain={[0, 100]}
              stroke="#9ca3af"
              fontSize={12}
              tickLine={false}
              axisLine={false}
            />
            <RechartsTooltip />
            <Line
              type="monotone"
              dataKey="score"
              stroke="#16a34a"
              strokeWidth={3}
              dot={{ r: 4 }}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
