'use client';

import React, { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Text } from '@/components/atoms/Text';

export interface CatalogEventDescriptor {
  type: string;
  summary: string;
}

export interface SubscriptionFormValues {
  url: string;
  description: string;
  events: string[];
  active: boolean;
}

interface WebhookSubscriptionModalProps {
  isOpen: boolean;
  mode: 'create' | 'edit';
  initialValues?: SubscriptionFormValues;
  catalogEvents: CatalogEventDescriptor[];
  onClose: () => void;
  onSubmit: (values: SubscriptionFormValues) => Promise<void>;
}

const DEFAULT_EVENTS = [
  'credit.verified',
  'project.approved',
  'credit.retired',
  'price.changed',
  'project.status.changed',
];

export function WebhookSubscriptionModal({
  isOpen,
  mode,
  initialValues,
  catalogEvents,
  onClose,
  onSubmit,
}: WebhookSubscriptionModalProps): ReactNode {
  const [url, setUrl] = useState(initialValues?.url ?? '');
  const [description, setDescription] = useState(initialValues?.description ?? '');
  const [events, setEvents] = useState<string[]>(initialValues?.events ?? DEFAULT_EVENTS);
  const [active, setActive] = useState(initialValues?.active ?? true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setUrl(initialValues?.url ?? '');
    setDescription(initialValues?.description ?? '');
    setEvents(initialValues?.events ?? DEFAULT_EVENTS);
    setActive(initialValues?.active ?? true);
    setError(null);
  }, [isOpen, initialValues]);

  if (!isOpen) return null;

  const availableEvents: CatalogEventDescriptor[] =
    catalogEvents.length > 0
      ? catalogEvents
      : DEFAULT_EVENTS.map((type) => ({ type, summary: type }));

  function toggleEvent(eventType: string): void {
    setEvents((prev) =>
      prev.includes(eventType) ? prev.filter((item) => item !== eventType) : [...prev, eventType]
    );
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setError(null);
    if (!url.trim()) {
      setError('Callback URL is required.');
      return;
    }
    if (events.length === 0) {
      setError('Select at least one webhook event.');
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit({
        url: url.trim(),
        description: description.trim(),
        events,
        active,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save subscription');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="webhook-subscription-modal-title"
    >
      <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <Text as="h3" variant="h3" id="webhook-subscription-modal-title">
            {mode === 'create' ? 'Add Webhook Subscription' : 'Edit Webhook Subscription'}
          </Text>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-gray-500 hover:text-gray-700"
            aria-label="Close modal"
          >
            Close
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div>
            <label htmlFor="webhook-url" className="mb-1 block text-sm font-medium text-gray-700">
              Endpoint URL
            </label>
            <input
              id="webhook-url"
              type="url"
              required
              placeholder="https://partner.example.com/webhooks/offsets"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label
              htmlFor="webhook-description"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              Description (optional)
            </label>
            <input
              id="webhook-description"
              type="text"
              placeholder="External ESG reporting pipeline"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <span className="mb-2 block text-sm font-medium text-gray-700">Subscribed Events</span>
            <div className="max-h-52 space-y-2 overflow-y-auto rounded-md border border-gray-200 p-3">
              {availableEvents.map((evt) => (
                <label key={evt.type} className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={events.includes(evt.type)}
                    onChange={() => toggleEvent(evt.type)}
                    className="mt-1"
                  />
                  <span>
                    <span className="font-mono text-xs font-semibold text-gray-900">
                      {evt.type}
                    </span>
                    <span className="block text-xs text-gray-500">{evt.summary}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            Subscription active
          </label>

          {error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700" role="alert">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting
                ? 'Saving...'
                : mode === 'create'
                  ? 'Create Subscription'
                  : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
