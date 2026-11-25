'use client';

import { useState } from 'react';
import { CheckCircle2, Circle, ExternalLink, FileCheck2, Loader2, ShieldAlert } from 'lucide-react';
import type { BenefactorMilestone } from '@/lib/benefactors/milestones';

export function BenefactorMilestoneTimeline({ milestones }: { milestones: BenefactorMilestone[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  return (
    <section
      aria-labelledby="milestone-progress-title"
      className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2
            id="milestone-progress-title"
            className="text-xl font-bold text-slate-900 dark:text-white"
          >
            Project progress &amp; verification
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Follow each release gate from pledge to steward rewards.
          </p>
        </div>
        <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
          {milestones.filter((item) => item.status === 'completed').length}/{milestones.length}{' '}
          complete
        </span>
      </div>
      <div role="list" className="mt-6 space-y-0">
        {milestones.map((milestone, index) => {
          const isOpen = expanded === milestone.key;
          const completed = milestone.status === 'completed';
          const disputed = milestone.status === 'disputed';
          return (
            <div key={milestone.key} role="listitem" className="relative flex gap-4 pb-6 last:pb-0">
              {index < milestones.length - 1 && (
                <span
                  aria-hidden="true"
                  className={`absolute left-[15px] top-8 h-full w-0.5 ${completed ? 'bg-emerald-300' : 'bg-slate-200 dark:bg-slate-700'}`}
                />
              )}
              <div
                className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 bg-white dark:bg-slate-900 ${completed ? 'border-emerald-600 text-emerald-600' : disputed ? 'border-rose-500 text-rose-500' : milestone.status === 'current' ? 'border-blue-600 text-blue-600' : 'border-slate-300 text-slate-400'}`}
              >
                {completed ? (
                  <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
                ) : disputed ? (
                  <ShieldAlert className="h-5 w-5" aria-hidden="true" />
                ) : milestone.status === 'current' ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Circle className="h-3 w-3" aria-hidden="true" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : milestone.key)}
                  aria-expanded={isOpen}
                  className="w-full text-left"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-semibold text-slate-900 dark:text-white">
                      {milestone.label}
                    </h3>
                    <span className="text-xs font-medium capitalize text-slate-500">
                      {milestone.status}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                    {milestone.description}
                  </p>
                  {milestone.completedAt && (
                    <p className="mt-1 text-xs text-slate-400">Completed {milestone.completedAt}</p>
                  )}
                </button>
                {isOpen && (
                  <div className="mt-3 rounded-lg bg-slate-50 p-3 dark:bg-slate-950">
                    <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <FileCheck2 className="h-4 w-4" aria-hidden="true" /> Verification proofs
                    </p>
                    {milestone.proofs.length ? (
                      <ul className="mt-2 space-y-2">
                        {milestone.proofs.map((proof) => (
                          <li
                            key={proof.id}
                            className="flex items-center justify-between gap-3 text-sm"
                          >
                            <span className="text-slate-700 dark:text-slate-200">
                              {proof.label}
                              {proof.verifier ? ` · ${proof.verifier}` : ''}
                            </span>
                            <a
                              href={proof.uri}
                              className="inline-flex items-center gap-1 text-emerald-700 hover:underline dark:text-emerald-300"
                            >
                              View <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                            </a>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-2 text-sm text-slate-500">
                        Proofs will appear after this release gate is completed.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
