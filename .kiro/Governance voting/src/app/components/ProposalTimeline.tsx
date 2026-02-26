import { motion } from 'motion/react';
import { Check, Circle, Clock, CheckCircle2 } from 'lucide-react';
import type { ProposalStatus } from '../store/governanceStore';

interface ProposalTimelineProps {
  status: ProposalStatus;
}

interface TimelineStep {
  label: string;
  status: 'completed' | 'active' | 'pending';
  icon: React.ReactNode;
}

export function ProposalTimeline({ status }: ProposalTimelineProps) {
  const getSteps = (): TimelineStep[] => {
    const statusOrder: ProposalStatus[] = ['Active', 'Succeeded', 'Executed'];
    const currentIndex = statusOrder.indexOf(status);

    return [
      {
        label: 'Active',
        status:
          currentIndex >= 0
            ? currentIndex === 0
              ? 'active'
              : 'completed'
            : 'pending',
        icon:
          currentIndex > 0 ? (
            <Check className="w-4 h-4" />
          ) : (
            <Clock className="w-4 h-4" />
          ),
      },
      {
        label: 'Succeeded',
        status:
          status === 'Defeated'
            ? 'pending'
            : currentIndex >= 1
            ? currentIndex === 1
              ? 'active'
              : 'completed'
            : 'pending',
        icon:
          currentIndex > 1 ? (
            <Check className="w-4 h-4" />
          ) : (
            <CheckCircle2 className="w-4 h-4" />
          ),
      },
      {
        label: 'Executed',
        status: currentIndex >= 2 ? 'active' : 'pending',
        icon: <Circle className="w-4 h-4" />,
      },
    ];

    // Handle Defeated status
    if (status === 'Defeated') {
      return [
        {
          label: 'Active',
          status: 'completed',
          icon: <Check className="w-4 h-4" />,
        },
        {
          label: 'Defeated',
          status: 'active',
          icon: <Circle className="w-4 h-4" />,
        },
        {
          label: 'Executed',
          status: 'pending',
          icon: <Circle className="w-4 h-4" />,
        },
      ];
    }

    return [
      {
        label: 'Active',
        status:
          currentIndex >= 0
            ? currentIndex === 0
              ? 'active'
              : 'completed'
            : 'pending',
        icon:
          currentIndex > 0 ? (
            <Check className="w-4 h-4" />
          ) : (
            <Clock className="w-4 h-4" />
          ),
      },
      {
        label: 'Succeeded',
        status:
          currentIndex >= 1
            ? currentIndex === 1
              ? 'active'
              : 'completed'
            : 'pending',
        icon:
          currentIndex > 1 ? (
            <Check className="w-4 h-4" />
          ) : (
            <CheckCircle2 className="w-4 h-4" />
          ),
      },
      {
        label: 'Executed',
        status: currentIndex >= 2 ? 'active' : 'pending',
        icon: <Circle className="w-4 h-4" />,
      },
    ];
  };

  const steps = getSteps();

  return (
    <div className="flex flex-col gap-0">
      {steps.map((step, index) => (
        <div key={step.label} className="flex items-start gap-3">
          {/* Icon and line */}
          <div className="flex flex-col items-center">
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: index * 0.1, duration: 0.3 }}
              className={`w-8 h-8 rounded-full flex items-center justify-center ${
                step.status === 'completed'
                  ? 'bg-green-500 text-white'
                  : step.status === 'active'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-200 text-gray-400'
              }`}
            >
              {step.icon}
            </motion.div>
            {index < steps.length - 1 && (
              <div
                className={`w-0.5 h-12 ${
                  step.status === 'completed' ? 'bg-green-500' : 'bg-gray-200'
                }`}
              />
            )}
          </div>

          {/* Label */}
          <div className="flex-1 pt-1">
            <motion.p
              initial={{ x: -10, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: index * 0.1 + 0.1, duration: 0.3 }}
              className={`${
                step.status === 'active'
                  ? 'text-gray-900 font-medium'
                  : step.status === 'completed'
                  ? 'text-gray-600'
                  : 'text-gray-400'
              }`}
            >
              {step.label}
            </motion.p>
          </div>
        </div>
      ))}
    </div>
  );
}
