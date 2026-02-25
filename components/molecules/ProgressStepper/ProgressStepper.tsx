'use client';

import { useRouter } from 'next/navigation';
import { Text } from '@/components/atoms/Text';
import { cn } from '@/lib/utils';

export type StepStatus = 'completed' | 'current' | 'upcoming';

export interface Step {
  id: string;
  label: string;
  path: string;
  status: StepStatus;
}

export interface ProgressStepperProps {
  steps: Step[];
  onStepClick?: () => void;
  className?: string;
}

export function ProgressStepper({ steps, onStepClick, className }: ProgressStepperProps) {
  const router = useRouter();

  const handleStepClick = (step: Step) => {
    // Only allow navigation to completed steps
    if (step.status === 'completed' && onStepClick) {
      onStepClick();
    } else if (step.status === 'completed') {
      router.push(step.path);
    }
  };

  return (
    <nav className={cn('w-full', className)} aria-label="Progress">
      <ol role="list" className="flex items-center justify-between w-full">
        {steps.map((step, index) => {
          const isLast = index === steps.length - 1;
          const isClickable = step.status === 'completed';

          return (
            <li key={step.id} className={cn('flex items-center flex-1', !isLast && 'sm:flex-1')}>
              <div className="flex flex-col items-center flex-1 sm:flex-row sm:w-full">
                {/* Step Circle */}
                <button
                  type="button"
                  onClick={() => handleStepClick(step)}
                  disabled={!isClickable}
                  aria-current={step.status === 'current' ? 'step' : undefined}
                  aria-label={`${step.label} - ${step.status}`}
                  className={cn(
                    'relative flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-full border-2 transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2',
                    step.status === 'completed' &&
                      'border-stellar-green bg-stellar-green text-white cursor-pointer hover:bg-stellar-green/90 focus:ring-stellar-green',
                    step.status === 'current' &&
                      'border-stellar-blue bg-stellar-blue text-white ring-2 ring-stellar-blue/20 focus:ring-stellar-blue',
                    step.status === 'upcoming' &&
                      'border-muted-foreground/30 bg-background text-muted-foreground cursor-not-allowed',
                    !isClickable && 'cursor-not-allowed'
                  )}
                >
                  {step.status === 'completed' ? (
                    <svg
                      className="h-6 w-6 sm:h-7 sm:w-7"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                      aria-hidden="true"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <span className="text-sm sm:text-base font-semibold">{index + 1}</span>
                  )}
                  <span className="sr-only">{step.label}</span>
                </button>

                {/* Step Label - Desktop */}
                <Text
                  variant="small"
                  as="span"
                  className={cn(
                    'hidden sm:block mt-2 sm:mt-0 sm:ml-3 transition-colors duration-300',
                    step.status === 'completed' && 'text-stellar-green font-medium',
                    step.status === 'current' && 'text-stellar-blue font-semibold',
                    step.status === 'upcoming' && 'text-muted-foreground'
                  )}
                >
                  {step.label}
                </Text>

                {/* Connector Line */}
                {!isLast && (
                  <div
                    className={cn(
                      'hidden sm:flex flex-1 h-0.5 mx-4 transition-colors duration-300',
                      step.status === 'completed' ? 'bg-stellar-green' : 'bg-muted-foreground/30'
                    )}
                    aria-hidden="true"
                  />
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {/* Mobile Labels */}
      <div className="mt-4 sm:hidden">
        <Text
          variant="small"
          as="p"
          className={cn(
            'text-center font-medium transition-colors duration-300',
            steps.find((s) => s.status === 'current')?.status === 'current' && 'text-stellar-blue'
          )}
        >
          {steps.find((s) => s.status === 'current')?.label || 'Step'}
        </Text>
      </div>
    </nav>
  );
}
