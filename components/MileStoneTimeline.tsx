'use client';

import type { JSX } from 'react';
import { useState, useEffect } from 'react';
import {
  PiCheckCircleBold,
  PiHourglassBold,
  PiWarningBold,
  PiLockBold,
  PiCaretDownBold,
  PiCaretUpBold,
} from 'react-icons/pi';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MilestoneStatus = 'Funded' | 'In Progress' | 'Completed' | 'Disputed' | 'Upcoming';

export interface MilestoneItem {
  id: string;
  title: string;
  payoutPercent: number;
  status: MilestoneStatus;
  amount: string;
  description: string;
  date?: string;
}

export interface MilestoneTimelineProps {
  farmerAddress?: string;
  totalAmount?: string;
  initialStatus?: MilestoneStatus;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * MilestoneTimeline
 *
 * Visual timeline tracker showing completion paths for payouts.
 * Fully responsive and keyboard accessible.
 */
export function MilestoneTimeline({
  totalAmount = '$10,000',
  initialStatus = 'In Progress',
}: MilestoneTimelineProps): JSX.Element {
  const [isExpanded, setIsExpanded] = useState<boolean>(true);
  const [milestones, setMilestones] = useState<MilestoneItem[]>([]);
  const [progress, setProgress] = useState<number>(0);

  useEffect(() => {
    // Simulated fetching logic mapped against contract states
    const items: MilestoneItem[] = [
      {
        id: 'm1',
        title: 'Milestone 1: Planting & GPS Proof',
        payoutPercent: 75,
        status: 'Completed',
        amount: '$7,500',
        description: 'Verify tree seedlings placement via photographic hashes.',
        date: '2026-02-15',
      },
      {
        id: 'm2',
        title: 'Milestone 2: 6-Month Survival Rate',
        payoutPercent: 25,
        status: initialStatus,
        amount: '$2,500',
        description: 'Validate growth viability (> 70% threshold).',
      },
    ];

    setMilestones(items);

    // Calculate progression percentage
    const completedWeight = items
      .filter((m) => m.status === 'Completed')
      .reduce((sum, m) => sum + m.payoutPercent, 0);

    setProgress(completedWeight);
  }, [initialStatus]);

  const toggleExpand = () => setIsExpanded(!isExpanded);

  // ── Status Badges ────────────────────────────────────────────────────────

  const renderBadge = (status: MilestoneStatus) => {
    const baseClasses = 'flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full ';
    switch (status) {
      case 'Completed':
        return (
          <span className={`${baseClasses} bg-green-50 text-green-700 border border-green-200`}>
            <PiCheckCircleBold className="h-4 w-4" />
            Completed
          </span>
        );
      case 'In Progress':
        return (
          <span className={`${baseClasses} bg-blue-50 text-blue-700 border border-blue-200`}>
            <PiHourglassBold className="h-4 w-4 animate-spin-slow" />
            In Progress
          </span>
        );
      case 'Disputed':
        return (
          <span className={`${baseClasses} bg-red-50 text-red-700 border border-red-200`}>
            <PiWarningBold className="h-4 w-4 text-red-500" />
            Disputed
          </span>
        );
      case 'Funded':
        return (
          <span className={`${baseClasses} bg-purple-50 text-purple-700 border border-purple-200`}>
            <PiLockBold className="h-4 w-4" />
            Funded
          </span>
        );
      default:
        return (
          <span className={`${baseClasses} bg-gray-50 text-gray-500 border border-gray-200`}>
            <PiLockBold className="h-4 w-4" />
            Upcoming
          </span>
        );
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-6 dark:border-slate-800 dark:bg-slate-900">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4 mb-6">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Milestone Progress</h2>
          <p className="text-sm text-slate-500">
            Total Contract Allocation:{' '}
            <span className="font-semibold text-slate-700 dark:text-slate-300">{totalAmount}</span>
          </p>
        </div>
        <button
          onClick={toggleExpand}
          aria-expanded={isExpanded}
          aria-controls="milestone-timeline-body"
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800 transition-colors"
          aria-label={isExpanded ? 'Collapse milestones' : 'Expand milestones'}
        >
          {isExpanded ? (
            <PiCaretUpBold className="h-5 w-5 text-slate-600" />
          ) : (
            <PiCaretDownBold className="h-5 w-5 text-slate-600" />
          )}
        </button>
      </div>

      {isExpanded && (
        <div id="milestone-timeline-body" className="space-y-8 relative">
          {/* Animated Progress Line */}
          <div className="absolute left-[19px] top-4 bottom-4 w-0.5 bg-slate-100 dark:bg-slate-800" />
          <div
            className="absolute left-[19px] top-4 w-0.5 bg-blue-600 transition-all duration-1000 ease-in-out"
            style={{ height: `${progress}%` }}
          />

          {milestones.map((milestone) => {
            const isCompleted = milestone.status === 'Completed';
            const isInProgress = milestone.status === 'In Progress';
            const isDisputed = milestone.status === 'Disputed';

            return (
              <div
                key={milestone.id}
                className={`relative pl-12 flex flex-col md:flex-row md:items-center md:justify-between gap-4 transition-all`}
                role="article"
                aria-label={`Milestone: ${milestone.title}`}
              >
                {/* Visual Node Icon */}
                <div
                  className={`absolute left-0 top-0 mt-1 flex h-10 w-10 items-center justify-center rounded-full border-2 bg-white dark:bg-slate-900 transition-colors z-10 ${
                    isCompleted
                      ? 'border-green-500 text-green-500'
                      : isInProgress
                        ? 'border-blue-500 text-blue-500'
                        : isDisputed
                          ? 'border-red-500 text-red-500'
                          : 'border-slate-200 text-slate-300'
                  }`}
                >
                  {isCompleted && <PiCheckCircleBold className="h-6 w-6" />}
                  {isInProgress && <PiHourglassBold className="h-6 w-6 animate-spin-slow" />}
                  {isDisputed && <PiWarningBold className="h-6 w-6" />}
                  {!isCompleted && !isInProgress && !isDisputed && (
                    <PiLockBold className="h-5 w-5" />
                  )}
                </div>

                <div className="flex-1">
                  <h3 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                    {milestone.title}
                  </h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                    {milestone.description}
                  </p>
                  {milestone.date && (
                    <span className="text-xs text-slate-400 mt-2 block">
                      Released on {milestone.date}
                    </span>
                  )}
                </div>

                {/* Amount / Badges Block */}
                <div className="flex items-center gap-4 shrink-0 justify-between md:justify-end border-t md:border-t-0 border-slate-50 dark:border-slate-800 pt-2 md:pt-0">
                  <span className="text-base font-bold text-slate-800 dark:text-slate-200">
                    {milestone.amount} ({milestone.payoutPercent}%)
                  </span>
                  {renderBadge(milestone.status)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
