'use client';

import React, { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  MailCheck,
  Upload,
  Users,
} from 'lucide-react';
import {
  EMPLOYEE_CSV_COLUMNS,
  parseEmployeeCsv,
  type EmployeeImportSummary,
} from '@/lib/corporate-sponsorship/employeeImport';
import type { CorporateOrder } from '@/lib/corporate-sponsorship/packages';

interface BulkEmployeeImportProps {
  orders: CorporateOrder[];
  onOrderUpdated: (order: CorporateOrder) => void;
}

interface ImportResponse {
  summary: EmployeeImportSummary;
  reportUrl: string;
}

export function BulkEmployeeImport({ orders, onOrderUpdated }: BulkEmployeeImportProps) {
  const [selectedOrderId, setSelectedOrderId] = useState<string>(orders[0]?.id ?? '');
  const [csvText, setCsvText] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResponse | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedOrder = useMemo(
    () => orders.find((order) => order.id === selectedOrderId) ?? orders[0],
    [orders, selectedOrderId]
  );

  const preview = useMemo(() => (csvText ? parseEmployeeCsv(csvText) : null), [csvText]);

  const templateHref = selectedOrder
    ? `/api/corporate-sponsorship/employees/template?companyName=${encodeURIComponent(
        selectedOrder.branding.companyName
      )}`
    : '/api/corporate-sponsorship/employees/template';

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setError(null);
    setResult(null);
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.csv')) {
      setError('Please upload a .csv file.');
      return;
    }
    if (file.size > 1024 * 1024) {
      setError('CSV file must be 1 MB or smaller.');
      return;
    }

    setFileName(file.name);
    setCsvText(await file.text());
  }

  async function handleImport() {
    setError(null);
    setResult(null);

    if (!selectedOrder) {
      setError('Select a corporate order before importing employees.');
      return;
    }
    if (!csvText.trim()) {
      setError('Upload an employee CSV file first.');
      return;
    }
    if (preview && preview.errors.length > 0) {
      setError('Fix the CSV errors listed below before importing.');
      return;
    }

    setImporting(true);
    try {
      const response = await fetch('/api/corporate-sponsorship/employees/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: selectedOrder.id, csv: csvText }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Unable to import employee assignments.');
      }

      setResult(data as ImportResponse);

      // Refresh the order so newly assigned employees show in the dashboard.
      const refreshed = await fetch('/api/corporate-sponsorship/orders');
      if (refreshed.ok) {
        const dashboard = await refreshed.json();
        const updated = (dashboard.orders as CorporateOrder[] | undefined)?.find(
          (order) => order.id === selectedOrder.id
        );
        if (updated) onOrderUpdated(updated);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong during the import.');
    } finally {
      setImporting(false);
    }
  }

  function resetUpload() {
    setCsvText('');
    setFileName(null);
    setResult(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  if (!selectedOrder) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500 dark:border-gray-800 dark:bg-gray-900">
        Place a bulk sponsorship order before importing employee assignments.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
          <div>
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-emerald-600" />
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Bulk Employee Sponsorship Import
              </h2>
            </div>
            <p className="mt-1 max-w-2xl text-sm text-gray-600 dark:text-gray-400">
              Upload an employee CSV to assign sponsored trees as perks or onboarding gifts. Every
              email is validated before any trees are assigned, and each employee receives their
              tree codes by email.
            </p>
          </div>

          <select
            value={selectedOrder.id}
            onChange={(event) => {
              setSelectedOrderId(event.target.value);
              resetUpload();
            }}
            aria-label="Select corporate order for employee import"
            className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 focus:border-emerald-600 focus:outline-none dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
          >
            {orders.map((order) => (
              <option key={order.id} value={order.id}>
                {order.branding.companyName} — {order.orderNumber} ({order.quote.quantity} trees)
              </option>
            ))}
          </select>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-950/60">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-800 dark:text-gray-200">
              <Download className="h-4 w-4 text-emerald-600" />
              Step 1 — Download the CSV template
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Columns: {EMPLOYEE_CSV_COLUMNS.join(', ')}. The template includes example rows you can
              replace with your team.
            </p>
            <a
              href={templateHref}
              download
              className="mt-3 inline-flex items-center gap-2 rounded-lg border border-emerald-700 px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-950/40"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              Download employee CSV template
            </a>
          </div>

          <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-950/60">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-800 dark:text-gray-200">
              <Upload className="h-4 w-4 text-emerald-600" />
              Step 2 — Upload the completed CSV
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={handleFileChange}
              aria-label="Upload employee CSV"
              className="mt-3 block w-full text-xs text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-emerald-700 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white hover:file:bg-emerald-800 dark:text-gray-400"
            />
            {fileName && (
              <p className="mt-2 text-xs text-gray-500">
                Loaded <span className="font-medium">{fileName}</span>
              </p>
            )}
          </div>
        </div>

        {preview && (
          <div className="mt-4 rounded-lg border border-gray-200 dark:border-gray-800">
            {preview.errors.length > 0 ? (
              <div className="space-y-2 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-red-700 dark:text-red-400">
                  <AlertTriangle className="h-4 w-4" />
                  {preview.errors.length} row{preview.errors.length === 1 ? '' : 's'} need attention
                </div>
                <ul className="max-h-40 space-y-1 overflow-auto text-xs text-red-700 dark:text-red-300">
                  {preview.errors.map((rowError) => (
                    <li key={`${rowError.lineNumber}-${rowError.message}`}>
                      Line {rowError.lineNumber}: {rowError.message}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="h-4 w-4" />
                  {preview.rows.length} valid employee row{preview.rows.length === 1 ? '' : 's'} —{' '}
                  {preview.rows.reduce((sum, row) => sum + row.treeCount, 0)} trees requested
                </div>
                <div className="mt-3 overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 text-left text-xs dark:divide-gray-800">
                    <thead className="text-gray-500 uppercase dark:text-gray-400">
                      <tr>
                        <th className="py-1.5 pr-4">Name</th>
                        <th className="py-1.5 pr-4">Email</th>
                        <th className="py-1.5 pr-4">Department</th>
                        <th className="py-1.5 text-right">Trees</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800/70">
                      {preview.rows.slice(0, 5).map((row) => (
                        <tr key={row.email}>
                          <td className="py-1.5 pr-4 text-gray-800 dark:text-gray-200">
                            {row.name}
                          </td>
                          <td className="py-1.5 pr-4 text-gray-600 dark:text-gray-400">
                            {row.email}
                          </td>
                          <td className="py-1.5 pr-4 text-gray-600 dark:text-gray-400">
                            {row.department ?? '—'}
                          </td>
                          <td className="py-1.5 text-right text-gray-800 dark:text-gray-200">
                            {row.treeCount}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {preview.rows.length > 5 && (
                    <p className="mt-2 text-xs text-gray-500">
                      Showing 5 of {preview.rows.length} employee rows.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleImport}
            disabled={importing || !csvText.trim() || (preview?.errors.length ?? 0) > 0}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:opacity-60"
          >
            <MailCheck className="h-4 w-4" />
            {importing ? 'Importing & emailing employees...' : 'Import & send assignments'}
          </button>
          {(csvText || result) && (
            <button
              type="button"
              onClick={resetUpload}
              className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              Clear
            </button>
          )}
        </div>

        {error && (
          <p className="mt-3 rounded-lg bg-red-50 p-3 text-xs text-red-700 dark:bg-red-950/50 dark:text-red-300">
            {error}
          </p>
        )}
      </div>

      {result && (
        <div className="rounded-xl border border-emerald-200 bg-white p-6 dark:border-emerald-900/50 dark:bg-gray-900">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                Import confirmation summary
              </h3>
              <p className="mt-1 text-xs text-gray-500">
                Order {result.summary.orderNumber} · {result.summary.companyName} ·{' '}
                {new Date(result.summary.processedAt).toLocaleString()}
              </p>
            </div>
            <a
              href={result.reportUrl}
              download
              className="inline-flex items-center gap-2 rounded-lg border border-emerald-700 px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-950/40"
            >
              <Download className="h-3.5 w-3.5" />
              Download summary report (CSV)
            </a>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-950/60">
              <p className="text-xs text-gray-500">Employees assigned</p>
              <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
                {result.summary.employeesAssigned}
              </p>
            </div>
            <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-950/60">
              <p className="text-xs text-gray-500">Trees assigned</p>
              <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
                {result.summary.treesAssigned}
              </p>
            </div>
            <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-950/60">
              <p className="text-xs text-gray-500">Emails sent</p>
              <p className="mt-1 text-2xl font-bold text-emerald-700 dark:text-emerald-400">
                {result.summary.emailsSent}
              </p>
            </div>
            <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-950/60">
              <p className="text-xs text-gray-500">Trees remaining</p>
              <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
                {result.summary.treesRemaining}
              </p>
            </div>
          </div>

          {result.summary.emailsSkipped > 0 && (
            <p className="mt-3 text-xs text-amber-700 dark:text-amber-300">
              {result.summary.emailsSkipped} assignment email
              {result.summary.emailsSkipped === 1 ? ' was' : 's were'} not sent because email
              delivery is not configured in this environment. Assignments were still recorded.
            </p>
          )}
          {result.summary.emailsFailed > 0 && (
            <p className="mt-3 text-xs text-red-700 dark:text-red-300">
              {result.summary.emailsFailed} assignment email
              {result.summary.emailsFailed === 1 ? '' : 's'} failed to send. Use the report below to
              retry the affected employees.
            </p>
          )}

          <div className="mt-4 max-h-72 overflow-auto">
            <table className="min-w-full divide-y divide-gray-200 text-left text-xs dark:divide-gray-800">
              <thead className="sticky top-0 bg-gray-50 text-gray-500 uppercase dark:bg-gray-950 dark:text-gray-400">
                <tr>
                  <th className="px-3 py-2">Employee</th>
                  <th className="px-3 py-2">Email</th>
                  <th className="px-3 py-2">Department</th>
                  <th className="px-3 py-2">Tree codes</th>
                  <th className="px-3 py-2">Email status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800/70">
                {result.summary.assignments.map((assignment) => (
                  <tr key={assignment.email}>
                    <td className="px-3 py-2 text-gray-800 dark:text-gray-200">
                      {assignment.name}
                    </td>
                    <td className="px-3 py-2 text-gray-600 dark:text-gray-400">
                      {assignment.email}
                    </td>
                    <td className="px-3 py-2 text-gray-600 dark:text-gray-400">
                      {assignment.department ?? '—'}
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px] text-gray-600 dark:text-gray-400">
                      {assignment.treeCodes.join(', ')}
                    </td>
                    <td className="px-3 py-2 capitalize">
                      <span
                        className={
                          assignment.emailStatus === 'sent'
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : assignment.emailStatus === 'failed'
                              ? 'text-red-700 dark:text-red-400'
                              : 'text-amber-700 dark:text-amber-400'
                        }
                      >
                        {assignment.emailStatus}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
