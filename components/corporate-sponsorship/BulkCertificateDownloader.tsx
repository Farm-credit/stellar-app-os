'use client';

import React, { useMemo, useState } from 'react';
import { Award, Download, Plus, Trash2, Users } from 'lucide-react';
import { downloadBulkCertificatesPdf } from '@/lib/corporate-sponsorship/bulkCertificatePdf';
import {
  CO2_KG_PER_TREE_PER_YEAR,
  type CorporateOrder,
  type EmployeeCertificateRecipient,
} from '@/lib/corporate-sponsorship/packages';

interface BulkCertificateDownloaderProps {
  orders: CorporateOrder[];
}

interface RecipientRow {
  id: string;
  name: string;
  department: string;
  email: string;
  treeCount: number;
}

const DEFAULT_RECIPIENTS: RecipientRow[] = [
  {
    id: 'r-1',
    name: 'Amara Okafor',
    department: 'Engineering',
    email: 'amara@company.com',
    treeCount: 10,
  },
  { id: 'r-2', name: 'Liam Chen', department: 'Product', email: 'liam@company.com', treeCount: 10 },
  {
    id: 'r-3',
    name: 'Sofia Martinez',
    department: 'Sustainability',
    email: 'sofia@company.com',
    treeCount: 10,
  },
  {
    id: 'r-4',
    name: 'Noah Mensah',
    department: 'Operations',
    email: 'noah@company.com',
    treeCount: 10,
  },
  {
    id: 'r-5',
    name: 'Priya Patel',
    department: 'Design',
    email: 'priya@company.com',
    treeCount: 10,
  },
];

export function BulkCertificateDownloader({ orders }: BulkCertificateDownloaderProps) {
  const [selectedOrderId, setSelectedOrderId] = useState<string>(orders[0]?.id ?? '');
  const [recipients, setRecipients] = useState<RecipientRow[]>(DEFAULT_RECIPIENTS);
  const [bulkPasteText, setBulkPasteText] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedOrder = useMemo(
    () => orders.find((o) => o.id === selectedOrderId) ?? orders[0],
    [orders, selectedOrderId]
  );

  function addRecipientRow() {
    setRecipients((prev) => [
      ...prev,
      {
        id: `r-${Date.now()}-${prev.length}`,
        name: '',
        department: '',
        email: '',
        treeCount: 1,
      },
    ]);
  }

  function removeRecipientRow(id: string) {
    setRecipients((prev) => prev.filter((r) => r.id !== id));
  }

  function updateRecipient(id: string, patch: Partial<RecipientRow>) {
    setRecipients((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function handleBulkImport() {
    const lines = bulkPasteText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    if (lines.length === 0) return;

    const treesPerPerson = selectedOrder
      ? Math.max(1, Math.floor(selectedOrder.quote.quantity / lines.length))
      : 1;

    const imported: RecipientRow[] = lines.map((line, idx) => {
      const [name = '', department = '', email = ''] = line.split(',').map((s) => s.trim());
      return {
        id: `imp-${Date.now()}-${idx}`,
        name,
        department,
        email,
        treeCount: treesPerPerson,
      };
    });

    setRecipients(imported);
    setBulkPasteText('');
  }

  function handleDownloadBulkPdf() {
    setError(null);
    if (!selectedOrder) {
      setError('Please select a corporate order first.');
      return;
    }

    const validRecipients = recipients.filter((r) => r.name.trim().length > 0);
    if (validRecipients.length === 0) {
      setError('Add at least one employee name before downloading certificates.');
      return;
    }

    setDownloading(true);
    try {
      let cursor = 0;
      const payload: EmployeeCertificateRecipient[] = validRecipients.map((r) => {
        const count = Math.max(1, Number(r.treeCount) || 1);
        const assignedCodes = selectedOrder.trees
          .slice(cursor, cursor + count)
          .map((t) => t.treeCode);
        cursor += count;

        return {
          name: r.name.trim(),
          department: r.department.trim() || undefined,
          email: r.email.trim() || undefined,
          treeCount: count,
          treeCodes: assignedCodes.length > 0 ? assignedCodes : undefined,
        };
      });

      downloadBulkCertificatesPdf(selectedOrder, payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate PDF certificates.');
    } finally {
      setDownloading(false);
    }
  }

  if (!selectedOrder) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500 dark:border-gray-800 dark:bg-gray-900">
        Place a bulk sponsorship order first to generate co-branded employee PDF certificates.
      </div>
    );
  }

  const previewRecipient = recipients.find((r) => r.name.trim()) ?? {
    name: 'Employee Name',
    department: 'Department',
    treeCount: 10,
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
      {/* Left: Order & Recipients Editor */}
      <div className="space-y-5 rounded-xl border border-gray-200 bg-white p-6 lg:col-span-3 dark:border-gray-800 dark:bg-gray-900">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-emerald-600" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Employee Certificate Recipients
            </h2>
          </div>

          <select
            value={selectedOrder.id}
            onChange={(e) => setSelectedOrderId(e.target.value)}
            aria-label="Select corporate order for certificates"
            className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 focus:border-emerald-600 focus:outline-none dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
          >
            {orders.map((order) => (
              <option key={order.id} value={order.id}>
                {order.branding.companyName} — {order.orderNumber} ({order.quote.quantity} trees)
              </option>
            ))}
          </select>
        </div>

        {/* Bulk Paste Helper */}
        <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-3.5 dark:border-gray-700 dark:bg-gray-950/60">
          <label
            htmlFor="bulk-recipient-paste"
            className="block text-xs font-medium text-gray-700 dark:text-gray-300"
          >
            Quick Bulk Import (one employee per line: Name, Department, Email)
          </label>
          <textarea
            id="bulk-recipient-paste"
            rows={2}
            value={bulkPasteText}
            onChange={(e) => setBulkPasteText(e.target.value)}
            placeholder="Jane Doe, Engineering, jane@company.com"
            className="mt-1.5 w-full rounded-md border border-gray-300 bg-white p-2 text-xs text-gray-900 focus:border-emerald-600 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          />
          <button
            type="button"
            onClick={handleBulkImport}
            disabled={!bulkPasteText.trim()}
            className="mt-2 rounded-md bg-gray-800 px-3 py-1 text-xs font-medium text-white hover:bg-gray-700 disabled:opacity-50 dark:bg-gray-700 dark:hover:bg-gray-600"
          >
            Import List &amp; Auto-Distribute Trees
          </button>
        </div>

        {/* Recipient Rows */}
        <div className="space-y-2.5">
          {recipients.map((row) => (
            <div
              key={row.id}
              className="grid grid-cols-12 items-center gap-2 rounded-lg border border-gray-200 p-2.5 dark:border-gray-800"
            >
              <input
                type="text"
                value={row.name}
                onChange={(e) => updateRecipient(row.id, { name: e.target.value })}
                placeholder="Employee name"
                aria-label="Employee name"
                className="col-span-4 rounded border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
              />
              <input
                type="text"
                value={row.department}
                onChange={(e) => updateRecipient(row.id, { department: e.target.value })}
                placeholder="Department"
                aria-label="Department"
                className="col-span-4 rounded border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
              />
              <input
                type="number"
                min={1}
                value={row.treeCount}
                onChange={(e) =>
                  updateRecipient(row.id, { treeCount: Math.max(1, Number(e.target.value) || 1) })
                }
                aria-label="Trees per employee"
                className="col-span-3 rounded border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
              />
              <button
                type="button"
                onClick={() => removeRecipientRow(row.id)}
                aria-label="Remove recipient"
                className="col-span-1 flex justify-center text-gray-400 hover:text-red-600"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <button
            type="button"
            onClick={addRecipientRow}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Employee
          </button>

          <button
            type="button"
            onClick={handleDownloadBulkPdf}
            disabled={downloading}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:opacity-60"
          >
            <Download className="h-4 w-4" />
            {downloading
              ? 'Generating PDF...'
              : `Download Bulk PDF (${recipients.filter((r) => r.name.trim()).length} Certificates)`}
          </button>
        </div>

        {error && (
          <p className="rounded-lg bg-red-50 p-2.5 text-xs text-red-700 dark:bg-red-950/50 dark:text-red-300">
            {error}
          </p>
        )}
      </div>

      {/* Right: Co-Branded Certificate Live Preview */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 lg:col-span-2 dark:border-gray-800 dark:bg-gray-900">
        <div className="flex items-center gap-2">
          <Award className="h-5 w-5 text-emerald-600" />
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">
            Co-Branded Certificate Preview
          </h3>
        </div>
        <p className="mt-1 text-xs text-gray-500">
          Each employee receives a dedicated landscape A4 page in the downloaded PDF.
        </p>

        <div
          className="mt-4 overflow-hidden rounded-xl border-2 bg-[#fafcfa] text-center shadow-sm"
          style={{ borderColor: selectedOrder.branding.primaryColor }}
        >
          <div
            className="px-4 py-2.5 text-xs font-bold tracking-wider text-white uppercase"
            style={{ backgroundColor: selectedOrder.branding.primaryColor }}
          >
            Harvesta × {selectedOrder.branding.companyName}
          </div>

          <div className="space-y-3 p-6">
            <p
              className="text-sm font-bold tracking-wide uppercase"
              style={{ color: selectedOrder.branding.primaryColor }}
            >
              Certificate of Tree Sponsorship
            </p>
            <p className="text-[11px] tracking-widest text-gray-500 uppercase">
              Proudly Presented To
            </p>
            <p className="text-xl font-bold text-gray-900">{previewRecipient.name}</p>
            {previewRecipient.department && (
              <p
                className="text-xs font-medium"
                style={{ color: selectedOrder.branding.secondaryColor }}
              >
                {previewRecipient.department}
              </p>
            )}
            <p className="text-xs leading-relaxed text-gray-700">
              In recognition of <strong>{previewRecipient.treeCount} native trees</strong> sponsored
              by <strong>{selectedOrder.branding.companyName}</strong>, offsetting an estimated{' '}
              <strong>
                {(previewRecipient.treeCount * CO2_KG_PER_TREE_PER_YEAR).toLocaleString('en-US')} kg
                CO₂/yr
              </strong>
              .
            </p>
            {selectedOrder.branding.tagline && (
              <p
                className="text-xs italic"
                style={{ color: selectedOrder.branding.secondaryColor }}
              >
                &ldquo;{selectedOrder.branding.tagline}&rdquo;
              </p>
            )}
            <div className="border-t border-gray-200 pt-3 text-[10px] text-gray-500">
              Order Ref: {selectedOrder.orderNumber} · Verified on Harvesta
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
