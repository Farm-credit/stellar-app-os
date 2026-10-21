'use client';

import React, { useState } from 'react';
import { Award, Calendar, PartyPopper, Sparkles } from 'lucide-react';
import type { SponsorMilestone } from '@/lib/gamification/sponsor-milestones';
import { CelebrationModal } from '@/components/molecules/CelebrationModal';

interface SponsorMilestoneHistoryProps {
  milestones: SponsorMilestone[];
  sponsorName?: string;
}

export function SponsorMilestoneHistory({ milestones, sponsorName }: SponsorMilestoneHistoryProps) {
  const [selectedMilestone, setSelectedMilestone] = useState<SponsorMilestone | null>(null);

  if (!milestones || milestones.length === 0) {
    return (
      <section
        aria-labelledby="milestone-history-heading"
        className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950"
      >
        <h2
          id="milestone-history-heading"
          className="text-2xl font-semibold text-slate-900 dark:text-white"
        >
          Milestone history
        </h2>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          No milestones unlocked yet. Sponsor trees to unlock milestone celebrations and shareable
          achievements!
        </p>
      </section>
    );
  }

  return (
    <section aria-labelledby="milestone-history-heading">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <h2
            id="milestone-history-heading"
            className="text-2xl font-semibold text-slate-900 dark:text-white"
          >
            Milestone history
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Celebrated achievements and sponsor badges
          </p>
        </div>
        <span className="text-sm font-medium text-slate-500 dark:text-slate-400">
          {milestones.length} milestone{milestones.length === 1 ? '' : 's'} achieved
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {milestones.map((milestone) => (
          <div
            key={milestone.id}
            className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
          >
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <Award className="h-5 w-5" />
                </span>
                <span className="inline-flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                  <Calendar className="h-3.5 w-3.5" />
                  {new Date(milestone.achievedAt).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  })}
                </span>
              </div>
              <h3 className="mt-3 font-semibold text-slate-900 dark:text-white">
                {milestone.title}
              </h3>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                {milestone.description}
              </p>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <span className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                <Sparkles className="h-3.5 w-3.5" /> Achieved
              </span>
              <button
                type="button"
                onClick={() => setSelectedMilestone(milestone)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-300 dark:hover:bg-emerald-900 transition"
              >
                <PartyPopper className="h-3.5 w-3.5" /> Celebrate & Share
              </button>
            </div>
          </div>
        ))}
      </div>

      <CelebrationModal
        milestone={selectedMilestone}
        isOpen={Boolean(selectedMilestone)}
        onClose={() => setSelectedMilestone(null)}
        sponsorName={sponsorName}
      />
    </section>
  );
}
