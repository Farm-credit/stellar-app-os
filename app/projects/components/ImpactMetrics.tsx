"use client";

import React, { useEffect, useRef, useState } from "react";
import type { ImpactMetric, ProjectProgress } from "@/lib/types/project";
import { fmt, pct } from "@/lib/utils/project-data";


function useCountUp(target: number, duration: number, shouldRun: boolean): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!shouldRun) return;
    let start: number | null = null;
    const raf = requestAnimationFrame(function step(ts) {
      if (!start) start = ts;
      const progress = Math.min((ts - start) / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3);
      setValue(Math.floor(ease * target));
      if (progress < 1) requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(raf);
  }, [target, duration, shouldRun]);
  return value;
}


const VARIANT_CARD: Record<ImpactMetric["variant"], string> = {
  green: "border-emerald-700/40 bg-emerald-950/30 hover:border-emerald-600/60",
  blue: "border-sky-700/40 bg-sky-950/30 hover:border-sky-600/60",
  amber: "border-amber-700/40 bg-amber-950/30 hover:border-amber-600/60",
  stone: "border-stone-700/40 bg-stone-900/40 hover:border-stone-500/60",
};

const VARIANT_TEXT: Record<ImpactMetric["variant"], string> = {
  green: "text-emerald-400",
  blue: "text-sky-400",
  amber: "text-amber-400",
  stone: "text-stone-300",
};


function MetricCard({ metric, animate }: { metric: ImpactMetric; animate: boolean }) {
  const count = useCountUp(metric.value, 1600, animate);
  const displayed = animate ? count : metric.value;

  return (
    <article
      className={`rounded-2xl border p-5 transition-all duration-300 group cursor-default ${VARIANT_CARD[metric.variant]}`}
      aria-label={`${metric.label}: ${metric.value.toLocaleString()} ${metric.unit}`}
    >
      <div className="flex items-start justify-between mb-3">
        <span className="text-2xl" role="img" aria-hidden="true">{metric.icon}</span>
        <span className="font-mono text-xs text-stone-500 uppercase tracking-wide">{metric.unit}</span>
      </div>
      <div className={`font-display text-3xl font-bold mb-1 ${VARIANT_TEXT[metric.variant]}`}>
        {fmt(displayed)}
      </div>
      <div className="text-sm font-semibold text-cream/70 mb-1">{metric.label}</div>
      <p className="text-xs text-stone-500 leading-relaxed">{metric.helpText}</p>
    </article>
  );
}


function ProgressBar({
  label, current, target, unit, colorClass, animate,
}: {
  label: string; current: number; target: number; unit: string;
  colorClass: string; animate: boolean;
}) {
  const p = pct(current, target);
  return (
    <div>
      <div className="flex justify-between items-baseline mb-2">
        <span className="text-sm font-semibold text-cream/70">{label}</span>
        <span className={`font-mono text-xs font-bold ${colorClass}`}>{p}%</span>
      </div>
      <div
        className="h-2 rounded-full bg-stone-800 overflow-hidden"
        role="progressbar"
        aria-valuenow={p}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${label} progress`}
      >
        <div
          className={`h-full rounded-full ${colorClass.replace("text-", "bg-")} transition-all duration-1000 ease-out`}
          style={{ width: animate ? `${p}%` : "0%" }}
        />
      </div>
      <div className="flex justify-between mt-1.5 font-mono text-xs text-stone-500">
        <span>{fmt(current)}</span>
        <span>{fmt(target)} {unit}</span>
      </div>
    </div>
  );
}


export function ImpactMetrics({ metrics, progress }: { metrics: ImpactMetric[]; progress: ProjectProgress }) {
  const ref = useRef<HTMLDivElement>(null);
  const [animated, setAnimated] = useState(false);

  useEffect(() => {
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setAnimated(true); obs.disconnect(); } },
      { threshold: 0.15 }
    );
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);

  return (
    <section ref={ref} className="py-20 px-6 md:px-10" aria-labelledby="metrics-heading">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-12">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-6 w-1 rounded-full bg-stellar-green" aria-hidden="true" />
            <span className="text-xs font-semibold text-stellar-green uppercase tracking-widest">Verified Impact</span>
          </div>
          <h2 id="metrics-heading" className="font-display text-3xl md:text-4xl font-bold text-cream mb-2">
            By the Numbers
          </h2>
          <p className="text-stone-400 max-w-lg font-body text-sm leading-relaxed">
            Every figure is independently audited and updated monthly. No greenwashing — just rigorously verified ecological recovery.
          </p>
        </div>

        {/* Metric cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4 mb-14" role="list">
          {metrics.map((m) => (
            <div key={m.id} role="listitem">
              <MetricCard metric={m} animate={animated} />
            </div>
          ))}
        </div>

        {/* Progress bars */}
        <div className="grid md:grid-cols-3 gap-8">
          <ProgressBar label="Trees Planted" current={progress.treesPlanted} target={progress.treesTarget} unit="trees" colorClass="text-emerald-400" animate={animated} />
          <ProgressBar label="CO₂ Removed" current={progress.co2RemovedTonnes} target={progress.co2TargetTonnes} unit="tCO₂e" colorClass="text-sky-400" animate={animated} />
          <ProgressBar label="Funding Raised" current={progress.fundingRaisedUsd} target={progress.fundingGoalUsd} unit="USD" colorClass="text-amber-400" animate={animated} />
        </div>
      </div>
    </section>
  );
}
