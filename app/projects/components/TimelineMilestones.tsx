import React from "react";
import type { Milestone } from "@/lib/types/project";

function MilestoneItem({ milestone, isLast }: { milestone: Milestone; isLast: boolean }) {
  const fmtDate = (d: string) =>
    new Date(d + "-01").toLocaleDateString("en-US", { month: "short", year: "numeric" });

  const iconCls = {
    done: "bg-stellar-green border-stellar-green text-stone-950",
    active: "bg-stellar-blue/20 border-stellar-blue text-stellar-blue animate-pulse",
    pending: "bg-stone-900 border-stone-700 text-stone-600",
  }[milestone.status];

  const lineCls = milestone.status === "done" ? "bg-stellar-green/30" : "bg-stone-800";

  const icon = milestone.status === "done"
    ? "✓"
    : milestone.status === "active"
    ? "◉"
    : "○";

  return (
    <li className="relative flex gap-6 group">
      {/* connector line */}
      {!isLast && (
        <div
          className={`absolute left-[19px] top-10 h-full w-0.5 -mb-6 ${lineCls}`}
          aria-hidden="true"
        />
      )}

      {/* Icon */}
      <div
        className={`relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 text-sm font-bold transition-transform group-hover:scale-110 ${iconCls}`}
        aria-hidden="true"
      >
        {icon}
      </div>

      {/* Content */}
      <div className="pb-10 flex-1 min-w-0">
        <div className="flex flex-wrap items-baseline gap-3 mb-1.5">
          <h3 className={`font-semibold text-sm ${milestone.status === "pending" ? "text-stone-500" : "text-cream"}`}>
            {milestone.title}
          </h3>
          <time
            dateTime={milestone.date}
            className="font-mono text-xs text-stone-500 shrink-0"
          >
            {fmtDate(milestone.date)}
          </time>
          {milestone.status === "done" && milestone.completedDate && (
            <span className="font-mono text-xs text-stellar-green/70">
              ✓ {fmtDate(milestone.completedDate)}
            </span>
          )}
        </div>

        <p className={`text-sm leading-relaxed ${milestone.status === "pending" ? "text-stone-600" : "text-stone-400"}`}>
          {milestone.body}
        </p>

        <span
          className={`mt-2 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border ${
            milestone.status === "done"
              ? "bg-stellar-green/10 text-stellar-green border-stellar-green/20"
              : milestone.status === "active"
              ? "bg-stellar-blue/10 text-stellar-blue border-stellar-blue/20"
              : "bg-stone-900 text-stone-600 border-stone-800"
          }`}
        >
          {{ done: "Completed", active: "In Progress", pending: "Upcoming" }[milestone.status]}
        </span>
      </div>
    </li>
  );
}

export function TimelineMilestones({ milestones }: { milestones: Milestone[] }) {
  const completed = milestones.filter((m) => m.status === "done").length;
  const next = milestones.find((m) => m.status !== "done");

  return (
    <section className="py-20 px-6 md:px-10 border-t border-stone-800/60" aria-labelledby="timeline-heading">
      <div className="max-w-7xl mx-auto grid lg:grid-cols-[1fr_300px] gap-16">
        {/* Timeline */}
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="h-6 w-1 rounded-full bg-emerald-500" aria-hidden="true" />
            <span className="text-xs font-semibold text-emerald-400 uppercase tracking-widest">Milestones</span>
          </div>
          <div className="flex items-end justify-between mb-10 gap-4">
            <h2 id="timeline-heading" className="font-display text-3xl md:text-4xl font-bold text-cream">
              Project Timeline
            </h2>
            <span className="font-mono text-sm text-stone-500 shrink-0" aria-live="polite">
              {completed}/{milestones.length}
            </span>
          </div>

          <ol aria-label="Project milestones" className="relative">
            {milestones.map((m, i) => (
              <MilestoneItem key={m.id} milestone={m} isLast={i === milestones.length - 1} />
            ))}
          </ol>
        </div>

        {/* Summary sidebar */}
        <aside className="space-y-4" aria-label="Timeline summary">
          <div className="sticky top-24 space-y-4">
            <div className="rounded-2xl border border-stone-800 bg-stone-900/60 p-6">
              <h3 className="font-mono text-xs text-stone-500 uppercase tracking-widest mb-5">Summary</h3>
              {[
                { label: "Completed", count: milestones.filter(m => m.status === "done").length, color: "text-stellar-green" },
                { label: "In Progress", count: milestones.filter(m => m.status === "active").length, color: "text-stellar-blue" },
                { label: "Upcoming", count: milestones.filter(m => m.status === "pending").length, color: "text-stone-500" },
              ].map(({ label, count, color }) => (
                <div key={label} className="flex items-center justify-between py-2 border-b border-stone-800 last:border-0">
                  <span className="text-sm text-stone-400">{label}</span>
                  <span className={`font-display text-2xl font-bold ${color}`}>{count}</span>
                </div>
              ))}

              <div className="mt-4">
                <div
                  className="h-2 rounded-full bg-stone-800 overflow-hidden"
                  role="progressbar"
                  aria-valuenow={Math.round((completed / milestones.length) * 100)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="Milestone completion"
                >
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-stellar-green to-emerald-400"
                    style={{ width: `${(completed / milestones.length) * 100}%` }}
                  />
                </div>
                <p className="text-right font-mono text-xs text-stone-500 mt-1.5">
                  {Math.round((completed / milestones.length) * 100)}% milestones done
                </p>
              </div>
            </div>

            {next && (
              <div className="rounded-2xl border border-stellar-blue/20 bg-stellar-blue/5 p-5">
                <p className="text-xs text-stellar-blue font-semibold mb-1">Next Milestone</p>
                <p className="text-sm text-stone-300">{next.title}</p>
              </div>
            )}
          </div>
        </aside>
      </div>
    </section>
  );
}
