'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertCircle, RotateCcw } from 'lucide-react';
import { Button } from '@/components/atoms/Button';
import { Text } from '@/components/atoms/Text';

export interface MilestoneErrorBoundaryProps {
  children: ReactNode;
  fallbackTitle?: string;
}

interface MilestoneErrorBoundaryState {
  hasError: boolean;
  errorMessage: string | null;
}

/**
 * Error boundary wrapping milestone verification and verifier reward payout
 * panels so runtime rendering or formatting errors fail safely with recovery.
 */
export class MilestoneErrorBoundary extends Component<
  MilestoneErrorBoundaryProps,
  MilestoneErrorBoundaryState
> {
  constructor(props: MilestoneErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, errorMessage: null };
  }

  static getDerivedStateFromError(error: Error): MilestoneErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error.message || 'Unexpected milestone payout error',
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[MilestoneErrorBoundary]', error, info.componentStack);
  }

  private handleReset = (): void => {
    this.setState({ hasError: false, errorMessage: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          aria-live="assertive"
          className="space-y-4 rounded-xl border border-destructive/40 bg-destructive/10 p-6 text-destructive"
        >
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            <div className="space-y-1">
              <Text variant="h4" as="h2" className="text-destructive">
                {this.props.fallbackTitle ?? 'Milestone payout section unavailable'}
              </Text>
              <p className="text-sm">
                {this.state.errorMessage ?? 'An unexpected error occurred while loading payouts.'}
              </p>
            </div>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={this.handleReset}>
            <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
            Try Again
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
