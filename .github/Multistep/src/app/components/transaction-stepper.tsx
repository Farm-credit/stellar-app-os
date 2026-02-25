import { CheckCircle2, Circle, Loader2 } from 'lucide-react';
import { cn } from '../ui/utils';

export type TransactionStep = 'approve' | 'sign' | 'confirm';
export type StepStatus = 'pending' | 'active' | 'completed' | 'error';

interface TransactionStepperProps {
  currentStep: TransactionStep;
  stepStatuses: Record<TransactionStep, StepStatus>;
}

const steps: { id: TransactionStep; label: string; description: string }[] = [
  {
    id: 'approve',
    label: 'Approve Asset',
    description: 'Grant permission to list project',
  },
  {
    id: 'sign',
    label: 'Sign Transaction',
    description: 'Authorize blockchain transaction',
  },
  {
    id: 'confirm',
    label: 'Confirm',
    description: 'Finalize project submission',
  },
];

export function TransactionStepper({ currentStep, stepStatuses }: TransactionStepperProps) {
  const getStepIcon = (stepId: TransactionStep) => {
    const status = stepStatuses[stepId];

    if (status === 'completed') {
      return <CheckCircle2 className="w-6 h-6 text-green-600" />;
    }

    if (status === 'active') {
      return <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />;
    }

    if (status === 'error') {
      return <Circle className="w-6 h-6 text-red-600" />;
    }

    return <Circle className="w-6 h-6 text-gray-300" />;
  };

  return (
    <div className="space-y-4">
      {steps.map((step, index) => {
        const status = stepStatuses[step.id];
        const isActive = status === 'active';
        const isCompleted = status === 'completed';
        const isError = status === 'error';
        const isLast = index === steps.length - 1;

        return (
          <div key={step.id} className="relative">
            <div
              className={cn(
                'flex items-start gap-4 p-4 rounded-lg border-2 transition-all',
                isActive && 'border-blue-500 bg-blue-50',
                isCompleted && 'border-green-500 bg-green-50',
                isError && 'border-red-500 bg-red-50',
                !isActive && !isCompleted && !isError && 'border-gray-200 bg-gray-50'
              )}
            >
              <div className="flex-shrink-0 mt-1">{getStepIcon(step.id)}</div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <h3
                    className={cn(
                      'font-semibold text-lg',
                      isActive && 'text-blue-900',
                      isCompleted && 'text-green-900',
                      isError && 'text-red-900',
                      !isActive && !isCompleted && !isError && 'text-gray-600'
                    )}
                  >
                    {step.label}
                  </h3>

                  {isActive && (
                    <span className="text-xs font-medium text-blue-700 bg-blue-100 px-3 py-1 rounded-full">
                      In Progress
                    </span>
                  )}

                  {isCompleted && (
                    <span className="text-xs font-medium text-green-700 bg-green-100 px-3 py-1 rounded-full">
                      Completed
                    </span>
                  )}

                  {isError && (
                    <span className="text-xs font-medium text-red-700 bg-red-100 px-3 py-1 rounded-full">
                      Failed
                    </span>
                  )}
                </div>

                <p
                  className={cn(
                    'text-sm mt-1',
                    isActive && 'text-blue-700',
                    isCompleted && 'text-green-700',
                    isError && 'text-red-700',
                    !isActive && !isCompleted && !isError && 'text-gray-500'
                  )}
                >
                  {step.description}
                </p>
              </div>
            </div>

            {!isLast && <div className="ml-7 h-8 w-0.5 bg-gray-200" />}
          </div>
        );
      })}
    </div>
  );
}
