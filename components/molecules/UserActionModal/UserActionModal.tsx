'use client';

import { type ReactNode } from 'react';
import { Button } from '@/components/atoms/Button';
import { Text } from '@/components/atoms/Text';

interface ReasonFieldConfig {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

interface UserActionModalProps {
  isOpen: boolean;
  title: string;
  description: string;
  action: string;
  variant: 'destructive' | 'warning' | 'info';
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
  reasonField?: ReasonFieldConfig;
}

const variantBorder: Record<'destructive' | 'warning' | 'info', string> = {
  destructive: 'border-destructive',
  warning: 'border-yellow-500',
  info: 'border-stellar-blue',
};

const confirmButtonClass: Record<'destructive' | 'warning' | 'info', string> = {
  destructive: 'bg-destructive text-white hover:bg-destructive/90',
  warning: 'bg-stellar-purple text-white hover:bg-stellar-purple/90',
  info: 'bg-stellar-blue text-white hover:bg-stellar-blue/90',
};

export function UserActionModal({
  isOpen,
  title,
  description,
  action,
  variant,
  onConfirm,
  onCancel,
  isLoading = false,
  reasonField,
}: UserActionModalProps): ReactNode {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="user-action-modal-title"
    >
      <div
        className={`w-full max-w-md rounded-xl border-2 bg-card p-6 shadow-xl ${variantBorder[variant]}`}
      >
        {/* Header */}
        <div className="mb-4">
          <Text as="h2" variant="h4" id="user-action-modal-title" className="mb-1">
            {title}
          </Text>
          <Text variant="muted" className="text-sm">
            {description}
          </Text>
        </div>

        {/* Count */}
        <div className="mb-4 rounded-lg bg-muted px-4 py-3 text-center">
          <Text variant="small">
            This action will affect <span className="font-semibold">1 user</span>.
          </Text>
        </div>

        {/* Reason */}
        {reasonField && (
          <div className="mb-4 space-y-1">
            <label htmlFor="user-action-reason" className="text-sm font-medium">
              {reasonField.label}
            </label>
            <textarea
              id="user-action-reason"
              value={reasonField.value}
              onChange={(e) => reasonField.onChange(e.target.value)}
              placeholder={reasonField.placeholder}
              className="h-20 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isLoading}
            />
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <Button
            onClick={onCancel}
            disabled={isLoading}
            variant="outline"
            className="flex-1"
          >
            Cancel
          </Button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${confirmButtonClass[variant]}`}
          >
            {isLoading ? 'Processing...' : action}
          </button>
        </div>
      </div>
    </div>
  );
}
