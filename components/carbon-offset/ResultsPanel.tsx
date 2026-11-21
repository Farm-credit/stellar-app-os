'use client';

import React from 'react';
import type { CarbonProfileResult } from '@/lib/carbon/calculator';

interface ResultsPanelProps {
  result: CarbonProfileResult;
  onReset?: () => void;
}

function formatNumber(value: number, digits = 1): string {
  return value.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

function formatCurrency(value: number): string {
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });
}

const BRAKKEDOWN_LABELS: Record<keyof CarbonProfileResult['breakdown'], string> = {
  householdElectricity: 'Electricity',
  householdGas: 'Natural gas',
  householdOil: 'Heating oil',
  householdPropane: 'Propane',
  vehicle: 'Vehicles',
  diet: 'Diet',
  flight: 'Flights',
  total: 'Total',
};

export function ResultsPanel({ result, onReset }: ResultsPanelProps) {
  const breakdownEntries = Object.entries(result.breakdown).filter(
    ([key, value]) => key !== 'total' && value > 0
  ) as Array<[keyof CarbonProfileResult['breakdown'], number]>;

  const maxValue = Math.max(...breakdownEntries.map(([, value]) => value), 1);
  const comparison = result.comparisonToRegionAverage;
  const isBelowAverage = comparison.differenceTCO2e <= 0;

  return (
    <div className="space-y-6">
      <div className="bg-green-600 text-white rounded-lg p-6 shadow">
        <p className="text-sm uppercase tracking-wide opacity-80">Your annual carbon footprint</p>
        <p className="text-4xl font-bold mt-1">
          {formatNumber(result.totalTCO2e, 2)}{' '}
          <span className="text-lg font-normal">tCO2e/year</span>
        </p>
        <p className="text-sm mt-2 opacity-90">
          {formatNumber(result.perCapitaTC2e, 2)} tCO2e per person · {result.creditsNeeded} carbon
          credit{result.creditsNeeded === 1 ? '' : 's'} needed
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-gray-200 rounded-lg p-4 text-center">
          <p className="text-xs uppercase tracking-wide text-gray-500">Credits needed</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{result.creditsNeeded}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4 text-center">
          <p className="text-xs uppercase tracking-wide text-gray-500">Estimated cost</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {formatCurrency(result.estimatedCostUSD)}
          </p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4 text-center">
          <p className="text-xs uppercase tracking-wide text-gray-500">Estimated cost</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {formatCurrency(result.estimatedCostUSD)}
          </p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4 text-center">
          <p className="text-xs uppercase tracking-wide text-gray-500">Trees equivalent</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {formatNumber(result.treesNeeded, 0)}
          </p>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Emissions by category</h3>
        <ul className="space-y-3">
          {breakdownEntries.map(([key, value]) => (
            <li key={key}>
              <div className="flex justify-between text-sm text-gray-700">
                <span>{BRAKKEDOWN_LABELS[key] ?? key}</span>
                <span className="font-medium">{formatNumber(value, 2)} tCO2e</span>
              </div>
              <div className="mt-1 h-2 w-full rounded-full bg-gray-100">
                <div
                  className="h-2 rounded-full bg-green-500"
                  style={{ width: `${Math.max((value / maxValue) * 100, 2)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">How you compare</h3>
        <p className="text-sm text-gray-700">
          Regional average for a household your size:{' '}
          <span className="font-medium">
            {formatNumber(comparison.regionAverageTCO2e, 2)} tCO2e
          </span>
        </p>
        <p
          className={`mt-2 text-sm font-medium ${isBelowAverage ? 'text-green-700' : 'text-amber-700'}`}
        >
          {isBelowAverage ? 'Below' : 'Above'} regional average by{' '}
          {formatNumber(Math.abs(comparison.percentDifference), 1)}%
        </p>
      </div>

      {onReset && (
        <button
          type="button"
          onClick={onReset}
          className="w-full px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
        >
          Recalculate
        </button>
      )}
    </div>
  );
}
