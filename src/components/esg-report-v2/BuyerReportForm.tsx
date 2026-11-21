'use client';

import { useState } from 'react';
import type { ReportPeriodType } from '@/lib/esg-reporting-v2';

export interface BuyerReportFormData {
  buyerId: string;
  companyName: string;
  periodType: ReportPeriodType;
  startDate: string;
  endDate: string;
}

interface BuyerReportFormProps {
  onSubmit: (data: BuyerReportFormData) => void;
  isLoading?: boolean;
}

export function BuyerReportForm({ onSubmit, isLoading = false }: BuyerReportFormProps) {
  const today = new Date();
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const startOfQuarter = new Date(today.getFullYear(), Math.floor(today.getMonth() / 3) * 3, 1);
  const startOfYear = new Date(today.getFullYear(), 0, 1);

  const defaultStart = startOfMonth.toISOString().split('T')[0];
  const defaultEnd = today.toISOString().split('T')[0];

  const [buyerId, setBuyerId] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [periodType, setPeriodType] = useState<ReportPeriodType>('month');
  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);

  const handlePreset = (type: ReportPeriodType) => {
    setPeriodType(type);
    setEndDate(defaultEnd);
    if (type === 'month') {
      setStartDate(startOfMonth.toISOString().split('T')[0]);
    } else if (type === 'quarter') {
      setStartDate(startOfQuarter.toISOString().split('T')[0]);
    } else if (type === 'custom') {
      // Keep current dates
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!buyerId.trim()) {
      alert('Please enter your Buyer ID');
      return;
    }
    onSubmit({
      buyerId: buyerId.trim(),
      companyName: companyName.trim() || 'Unnamed Buyer',
      periodType,
      startDate,
      endDate,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Buyer ID */}
      <div>
        <label className="block text-sm font-semibold text-foreground">
          Buyer ID <span className="text-red-600">*</span>
        </label>
        <input
          type="text"
          value={buyerId}
          onChange={(e) => setBuyerId(e.target.value)}
          placeholder="Your unique buyer identifier"
          className="mt-2 w-full rounded-lg border border-border bg-background px-4 py-2 text-foreground outline-none focus:ring-2 focus:ring-stellar-blue"
          disabled={isLoading}
        />
        <p className="mt-1 text-xs text-muted-foreground">
          Enter your buyer ID to load your offset purchase data
        </p>
      </div>

      {/* Company Name (Optional) */}
      <div>
        <label className="block text-sm font-semibold text-foreground">Company Name</label>
        <input
          type="text"
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          placeholder="Your company or organization name"
          className="mt-2 w-full rounded-lg border border-border bg-background px-4 py-2 text-foreground outline-none focus:ring-2 focus:ring-stellar-blue"
          disabled={isLoading}
        />
        <p className="mt-1 text-xs text-muted-foreground">
          Leave empty to use your buyer ID as the company name
        </p>
      </div>

      {/* Period Selection */}
      <div className="space-y-3">
        <label className="block text-sm font-semibold text-foreground">Reporting Period</label>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => handlePreset('month')}
            disabled={isLoading}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              periodType === 'month'
                ? 'bg-stellar-blue text-white'
                : 'border border-border bg-background text-foreground hover:bg-muted'
            } disabled:opacity-60`}
          >
            This Month
          </button>
          <button
            type="button"
            onClick={() => handlePreset('quarter')}
            disabled={isLoading}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              periodType === 'quarter'
                ? 'bg-stellar-blue text-white'
                : 'border border-border bg-background text-foreground hover:bg-muted'
            } disabled:opacity-60`}
          >
            This Quarter
          </button>
          <button
            type="button"
            onClick={() => handlePreset('custom')}
            disabled={isLoading}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              periodType === 'custom'
                ? 'bg-stellar-blue text-white'
                : 'border border-border bg-background text-foreground hover:bg-muted'
            } disabled:opacity-60`}
          >
            Custom Date Range
          </button>
        </div>
      </div>

      {/* Date Inputs */}
      {periodType === 'custom' && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-semibold text-foreground">Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="mt-2 w-full rounded-lg border border-border bg-background px-4 py-2 text-foreground outline-none focus:ring-2 focus:ring-stellar-blue"
              disabled={isLoading}
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-foreground">End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="mt-2 w-full rounded-lg border border-border bg-background px-4 py-2 text-foreground outline-none focus:ring-2 focus:ring-stellar-blue"
              disabled={isLoading}
            />
          </div>
        </div>
      )}

      {/* Submit Button */}
      <button
        type="submit"
        disabled={isLoading}
        className="w-full rounded-lg bg-stellar-blue px-4 py-2 font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {isLoading ? 'Generating Report...' : 'Generate Report'}
      </button>
    </form>
  );
}
