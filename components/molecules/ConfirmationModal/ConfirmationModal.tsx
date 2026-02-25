'use client';

import { type ReactNode } from 'react';
import { Button } from '@/components/atoms/Button';
import { Text } from '@/components/atoms/Text';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/molecules/Card';

interface ReasonFieldConfig {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

interface ConfirmationModalProps {
  isOpen: boolean;
  title: string;
  description: string;
  action: string;
  variant: 'destructive' | 'warning' | 'info';
  itemCount: number;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
  reasonField?: ReasonFieldConfig;
}

export function ConfirmationModal({
  isOpen,
  title,
  description,
  action,
  variant,
  itemCount,
  onConfirm,
  onCancel,
  isLoading = false,
  reasonField,
}: ConfirmationModalProps): ReactNode {
  if (!isOpen) {
    return null;
  }

  const variantStyles = {
    destructive: 'border-destructive/50 bg-destructive/5',
    warning: 'border-yellow-500/50 bg-yellow-50 dark:bg-yellow-950/20',
    info: 'border-stellar-blue/50 bg-stellar-blue/5',
  };

  const buttonConfig = {
    destructive: {
      stellar: 'primary' as const,
      className: 'bg-destructive hover:bg-destructive/90 text-white',
    },
    warning: {
      stellar: 'accent' as const,
      className: '',
    },
    info: {
      stellar: 'primary' as const,
      className: '',
    },
  };

  const buttonStyle = buttonConfig[variant];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <Card className={`w-full max-w-md ${variantStyles[variant]}`}>
        <CardHeader>
          <CardTitle className="text-lg">{title}</CardTitle>
          <CardDescription className="text-sm">{description}</CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="rounded-lg bg-muted p-3">
            <Text variant="small" className="text-center">
              <span className="font-semibold">{itemCount}</span>{' '}
              {itemCount === 1 ? 'project' : 'projects'} will be {action.toLowerCase()}
            </Text>
          </div>

          {reasonField && (
            <div className="space-y-2">
              <label htmlFor="reason-field" className="text-sm font-medium">
                {reasonField.label}
              </label>
              <textarea
                id="reason-field"
                value={reasonField.value}
                onChange={(e) => reasonField.onChange(e.target.value)}
                placeholder={reasonField.placeholder}
                className="h-20 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isLoading}
              />
            </div>
          )}

          <div className="flex gap-3">
            <Button onClick={onCancel} disabled={isLoading} className="flex-1" variant="outline">
              Cancel
            </Button>
            <Button
              onClick={onConfirm}
              disabled={isLoading}
              className={`flex-1 ${buttonStyle.className}`}
              stellar={buttonStyle.stellar}
            >
              {isLoading ? 'Processing...' : action}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
