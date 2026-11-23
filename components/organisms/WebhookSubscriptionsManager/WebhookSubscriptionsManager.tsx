'use client';

import React, { useState, type ReactNode } from 'react';
import { Text } from '@/components/atoms/Text';
import {
  WebhookSubscriptionModal,
  type CatalogEventDescriptor,
  type SubscriptionFormValues,
} from '@/components/molecules/WebhookSubscriptionModal/WebhookSubscriptionModal';

export interface AdminWebhookSubscriptionItem {
  id: string;
  internalId: number;
  url: string;
  description: string | null;
  events: string[];
  active: boolean;
  maskedSecret: string;
  consecutiveFailures: number;
  lastDeliveryStatus: string | null;
  disabledReason: string | null;
  createdAt: string;
}

interface WebhookSubscriptionsManagerProps {
  subscriptions: AdminWebhookSubscriptionItem[];
  catalogEvents: CatalogEventDescriptor[];
  loading?: boolean;
  onCreate: (values: SubscriptionFormValues) => Promise<{ secret: string }>;
  onUpdate: (id: string, values: Partial<SubscriptionFormValues>) => Promise<void>;
  onRotateSecret: (id: string) => Promise<{ secret: string }>;
  onTestPing: (id: string) => Promise<{
    delivered: boolean;
    httpStatus: number | null;
    durationMs: number;
    error: string | null;
  }>;
  onDelete: (id: string) => Promise<void>;
}

export function WebhookSubscriptionsManager({
  subscriptions,
  catalogEvents,
  loading = false,
  onCreate,
  onUpdate,
  onRotateSecret,
  onTestPing,
  onDelete,
}: WebhookSubscriptionsManagerProps): ReactNode {
  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null);
  const [editingSubscription, setEditingSubscription] =
    useState<AdminWebhookSubscriptionItem | null>(null);
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pingResult, setPingResult] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function handleCopySecret(): Promise<void> {
    if (!revealedSecret || typeof navigator === 'undefined' || !navigator.clipboard) return;
    await navigator.clipboard.writeText(revealedSecret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleModalSubmit(values: SubscriptionFormValues): Promise<void> {
    if (modalMode === 'create') {
      const res = await onCreate(values);
      setRevealedSecret(res.secret);
      setCopied(false);
    } else if (modalMode === 'edit' && editingSubscription) {
      await onUpdate(editingSubscription.id, values);
    }
  }

  async function handleRotate(id: string): Promise<void> {
    setBusyId(id);
    try {
      const res = await onRotateSecret(id);
      setRevealedSecret(res.secret);
      setCopied(false);
    } finally {
      setBusyId(null);
    }
  }

  async function handlePing(id: string): Promise<void> {
    setBusyId(id);
    setPingResult(null);
    try {
      const res = await onTestPing(id);
      setPingResult(
        res.delivered
          ? `Test ping succeeded (HTTP ${res.httpStatus ?? 200} in ${res.durationMs}ms)`
          : `Test ping failed (${res.error ?? 'Unknown error'})`
      );
    } finally {
      setBusyId(null);
    }
  }

  async function handleToggleActive(sub: AdminWebhookSubscriptionItem): Promise<void> {
    setBusyId(sub.id);
    try {
      await onUpdate(sub.id, { active: !sub.active });
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(id: string): Promise<void> {
    setBusyId(id);
    try {
      await onDelete(id);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Text as="h3" variant="h4">
          Registered Subscriptions ({subscriptions.length})
        </Text>
        <button
          type="button"
          onClick={() => {
            setEditingSubscription(null);
            setModalMode('create');
          }}
          className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          Add Subscription
        </button>
      </div>

      {revealedSecret && (
        <div
          className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"
          role="status"
        >
          <p className="font-semibold">
            Store this signing secret securely — it will not be shown again.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="rounded bg-white px-2 py-1 font-mono text-xs text-gray-900">
              {revealedSecret}
            </code>
            <button
              type="button"
              onClick={() => void handleCopySecret()}
              className="rounded border border-amber-400 bg-white px-2.5 py-1 text-xs font-medium text-amber-900 hover:bg-amber-100"
            >
              {copied ? 'Copied' : 'Copy secret'}
            </button>
            <button
              type="button"
              onClick={() => setRevealedSecret(null)}
              className="text-xs text-amber-800 underline"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {pingResult && (
        <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900">
          {pingResult}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Endpoint URL</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Events</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Secret</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Status</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {loading && subscriptions.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-gray-500">
                  Loading subscriptions...
                </td>
              </tr>
            ) : subscriptions.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-gray-500">
                  No webhook subscriptions registered yet.
                </td>
              </tr>
            ) : (
              subscriptions.map((sub) => (
                <tr key={sub.id}>
                  <td className="px-4 py-3">
                    <div className="font-mono text-xs text-gray-900">{sub.url}</div>
                    {sub.description && (
                      <div className="text-xs text-gray-500">{sub.description}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-700">{sub.events.join(', ')}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-700">{sub.maskedSecret}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        sub.active ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                      }`}
                    >
                      {sub.active ? 'active' : 'paused'}
                    </span>
                    {sub.consecutiveFailures > 0 && (
                      <span className="ml-2 text-xs text-red-600">
                        ({sub.consecutiveFailures} failures)
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2 text-xs">
                      <button
                        type="button"
                        disabled={busyId === sub.id}
                        onClick={() => void handlePing(sub.id)}
                        className="rounded border border-gray-300 px-2 py-1 hover:bg-gray-50"
                      >
                        Test
                      </button>
                      <button
                        type="button"
                        disabled={busyId === sub.id}
                        onClick={() => void handleToggleActive(sub)}
                        className="rounded border border-gray-300 px-2 py-1 hover:bg-gray-50"
                      >
                        {sub.active ? 'Pause' : 'Resume'}
                      </button>
                      <button
                        type="button"
                        disabled={busyId === sub.id}
                        onClick={() => {
                          setEditingSubscription(sub);
                          setModalMode('edit');
                        }}
                        className="rounded border border-gray-300 px-2 py-1 hover:bg-gray-50"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        disabled={busyId === sub.id}
                        onClick={() => void handleRotate(sub.id)}
                        className="rounded border border-gray-300 px-2 py-1 hover:bg-gray-50"
                      >
                        Rotate
                      </button>
                      <button
                        type="button"
                        disabled={busyId === sub.id}
                        onClick={() => void handleDelete(sub.id)}
                        className="rounded border border-red-200 px-2 py-1 text-red-700 hover:bg-red-50"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <WebhookSubscriptionModal
        isOpen={modalMode !== null}
        mode={modalMode ?? 'create'}
        initialValues={
          editingSubscription
            ? {
                url: editingSubscription.url,
                description: editingSubscription.description ?? '',
                events: editingSubscription.events,
                active: editingSubscription.active,
              }
            : undefined
        }
        catalogEvents={catalogEvents}
        onClose={() => setModalMode(null)}
        onSubmit={handleModalSubmit}
      />
    </div>
  );
}
