'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  Bug,
  CheckCircle2,
  Droplets,
  ExternalLink,
  Loader2,
  Ruler,
  Trees,
} from 'lucide-react';
import {
  computeHealthScore,
  type HealthObservation,
  type HealthStatus,
  type PestPresence,
  type WateringStatus,
} from '@/lib/tree-health/health-score';
import type { Tree } from '@/lib/types/tree';

interface FieldHealthDashboardProps {
  trees: Tree[];
  initialRecentObservations: HealthObservation[];
}

const PEST_OPTIONS: Array<{ value: PestPresence; label: string; hint: string }> = [
  { value: 'none', label: 'None', hint: 'No visible pests' },
  { value: 'mild', label: 'Mild', hint: 'Isolated signs' },
  { value: 'moderate', label: 'Moderate', hint: 'Treatment needed' },
  { value: 'severe', label: 'Severe', hint: 'Urgent action' },
];

const WATERING_OPTIONS: Array<{ value: WateringStatus; label: string; hint: string }> = [
  { value: 'optimal', label: 'Optimal', hint: 'Moist, healthy soil' },
  { value: 'adequate', label: 'Adequate', hint: 'Sufficient moisture' },
  { value: 'dry', label: 'Dry', hint: 'Needs watering soon' },
  { value: 'critical', label: 'Critical', hint: 'Severe drought stress' },
];

const STATUS_STYLES: Record<HealthStatus, { label: string; className: string }> = {
  healthy: {
    label: 'Healthy',
    className: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30',
  },
  fair: {
    label: 'Fair',
    className: 'bg-amber-500/15 text-amber-700 border-amber-500/30',
  },
  at_risk: {
    label: 'At Risk',
    className: 'bg-orange-500/15 text-orange-700 border-orange-500/30',
  },
  critical: {
    label: 'Critical',
    className: 'bg-rose-500/15 text-rose-700 border-rose-500/30',
  },
};

export function FieldHealthDashboard({
  trees,
  initialRecentObservations,
}: FieldHealthDashboardProps) {
  const [selectedTreeId, setSelectedTreeId] = useState<string>(trees[0]?.id ?? 'tree-001');
  const [heightCm, setHeightCm] = useState<string>('125');
  const [pestPresence, setPestPresence] = useState<PestPresence>('none');
  const [wateringStatus, setWateringStatus] = useState<WateringStatus>('optimal');
  const [observerName, setObserverName] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [syncedObservation, setSyncedObservation] = useState<HealthObservation | null>(null);
  const [recentObservations, setRecentObservations] =
    useState<HealthObservation[]>(initialRecentObservations);

  const selectedTree = useMemo(
    () => trees.find((tree) => tree.id === selectedTreeId) ?? trees[0],
    [trees, selectedTreeId]
  );

  const numericHeight = Number(heightCm);
  const liveScore = useMemo(() => {
    const validHeight = Number.isFinite(numericHeight) && numericHeight > 0 ? numericHeight : 0;
    return computeHealthScore({
      heightCm: validHeight,
      pestPresence,
      wateringStatus,
    });
  }, [numericHeight, pestPresence, wateringStatus]);

  const statusMeta = STATUS_STYLES[liveScore.status];

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setSyncedObservation(null);

    if (!Number.isFinite(numericHeight) || numericHeight <= 0) {
      setErrorMessage('Please enter a valid tree height in centimeters.');
      return;
    }

    if (!observerName.trim()) {
      setErrorMessage('Please enter the field observer name.');
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(`/api/trees/${encodeURIComponent(selectedTreeId)}/health`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          heightCm: numericHeight,
          pestPresence,
          wateringStatus,
          observerName: observerName.trim(),
          notes: notes.trim() || undefined,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        setErrorMessage(data?.error ?? 'Failed to save observation. Please try again.');
        return;
      }

      const created: HealthObservation = data.observation;
      setSyncedObservation(created);
      setRecentObservations((prev) => [created, ...prev].slice(0, 10));
      setNotes('');
    } catch {
      setErrorMessage('Network error while syncing observation. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Header */}
      <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-600 text-white">
              <Trees className="h-6 w-6" aria-hidden />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">
                Field Tree Health Dashboard
              </h1>
              <p className="text-sm text-slate-600">
                Log field measurements and sync live health scores to sponsor tree profiles.
              </p>
            </div>
          </div>

          {selectedTree && (
            <Link
              href={`/trees/${encodeURIComponent(selectedTree.id)}`}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100"
            >
              View Sponsor Profile
              <ExternalLink className="h-4 w-4" aria-hidden />
            </Link>
          )}
        </div>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Mobile-friendly Data Entry Form */}
        <form
          onSubmit={handleSubmit}
          className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 lg:col-span-3"
        >
          <h2 className="text-base font-semibold text-slate-900">Log Health Observation</h2>

          {/* Tree Selector */}
          <div>
            <label htmlFor="tree-select" className="block text-sm font-medium text-slate-700">
              Select Tree
            </label>
            <select
              id="tree-select"
              value={selectedTreeId}
              onChange={(e) => setSelectedTreeId(e.target.value)}
              className="mt-1.5 min-h-[48px] w-full rounded-xl border border-slate-300 bg-white px-3.5 text-base text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            >
              {trees.map((tree) => (
                <option key={tree.id} value={tree.id}>
                  {tree.treeId} — {tree.species} ({tree.region})
                </option>
              ))}
            </select>
          </div>

          {/* Height Measurement */}
          <div>
            <label
              htmlFor="height-cm"
              className="flex items-center gap-1.5 text-sm font-medium text-slate-700"
            >
              <Ruler className="h-4 w-4 text-emerald-600" aria-hidden />
              Height Measurement (cm)
            </label>
            <input
              id="height-cm"
              type="number"
              inputMode="decimal"
              min={1}
              max={5000}
              step="1"
              required
              value={heightCm}
              onChange={(e) => setHeightCm(e.target.value)}
              placeholder="e.g. 125"
              className="mt-1.5 min-h-[48px] w-full rounded-xl border border-slate-300 bg-white px-3.5 text-base text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>

          {/* Pest Presence */}
          <fieldset>
            <legend className="flex items-center gap-1.5 text-sm font-medium text-slate-700">
              <Bug className="h-4 w-4 text-amber-600" aria-hidden />
              Pest Presence
            </legend>
            <div className="mt-2 grid grid-cols-2 gap-2.5">
              {PEST_OPTIONS.map((option) => {
                const active = pestPresence === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setPestPresence(option.value)}
                    aria-pressed={active}
                    className={`min-h-[52px] rounded-xl border px-3 py-2 text-left transition-colors ${
                      active
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-900 ring-1 ring-emerald-600'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span className="block text-sm font-semibold">{option.label}</span>
                    <span className="block text-xs text-slate-500">{option.hint}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          {/* Watering Status */}
          <fieldset>
            <legend className="flex items-center gap-1.5 text-sm font-medium text-slate-700">
              <Droplets className="h-4 w-4 text-sky-600" aria-hidden />
              Watering Status
            </legend>
            <div className="mt-2 grid grid-cols-2 gap-2.5">
              {WATERING_OPTIONS.map((option) => {
                const active = wateringStatus === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setWateringStatus(option.value)}
                    aria-pressed={active}
                    className={`min-h-[52px] rounded-xl border px-3 py-2 text-left transition-colors ${
                      active
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-900 ring-1 ring-emerald-600'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span className="block text-sm font-semibold">{option.label}</span>
                    <span className="block text-xs text-slate-500">{option.hint}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          {/* Observer Name */}
          <div>
            <label htmlFor="observer-name" className="block text-sm font-medium text-slate-700">
              Field Observer Name
            </label>
            <input
              id="observer-name"
              type="text"
              required
              value={observerName}
              onChange={(e) => setObserverName(e.target.value)}
              placeholder="e.g. Amina Yusuf"
              className="mt-1.5 min-h-[48px] w-full rounded-xl border border-slate-300 bg-white px-3.5 text-base text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>

          {/* Field Notes */}
          <div>
            <label htmlFor="field-notes" className="block text-sm font-medium text-slate-700">
              Field Notes (optional)
            </label>
            <textarea
              id="field-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Soil condition, pruning, or treatment details..."
              className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-base text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>

          {errorMessage && (
            <p
              role="alert"
              className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700"
            >
              {errorMessage}
            </p>
          )}

          {syncedObservation && (
            <div
              role="status"
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
            >
              <span className="flex items-center gap-2 font-medium">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden />
                Observation logged (Score: {syncedObservation.healthScore}/100) & synced to sponsor
                profile.
              </span>
              <Link
                href={`/trees/${encodeURIComponent(syncedObservation.treeId)}`}
                className="font-semibold underline hover:text-emerald-700"
              >
                View Trend
              </Link>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-base font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                Syncing Observation...
              </>
            ) : (
              'Log & Sync Observation'
            )}
          </button>
        </form>

        {/* Live Health Score Preview + Recent Synced Logs */}
        <aside className="space-y-6 lg:col-span-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-emerald-600" aria-hidden />
                <h2 className="text-base font-semibold text-slate-900">Computed Health Score</h2>
              </div>
              <span
                className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusMeta.className}`}
              >
                {statusMeta.label}
              </span>
            </div>

            <div className="mt-4 flex items-baseline gap-1.5">
              <span className="text-4xl font-bold tabular-nums text-slate-900">
                {liveScore.score}
              </span>
              <span className="text-sm text-slate-500">/ 100</span>
            </div>

            <div className="mt-4 space-y-2.5 text-xs">
              <div className="flex items-center justify-between text-slate-600">
                <span>Watering (40%)</span>
                <span className="font-semibold text-slate-900">
                  {liveScore.breakdown.wateringScore}/100
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-600">
                <span>Pest Control (40%)</span>
                <span className="font-semibold text-slate-900">
                  {liveScore.breakdown.pestScore}/100
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-600">
                <span>Height Vigor (20%)</span>
                <span className="font-semibold text-slate-900">
                  {liveScore.breakdown.growthScore}/100
                </span>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900">Recent Synced Logs</h2>
            <ul className="mt-3 divide-y divide-slate-100">
              {recentObservations.slice(0, 5).map((obs) => {
                const obsStatus = STATUS_STYLES[obs.healthStatus];
                return (
                  <li key={obs.id} className="py-2.5 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <Link
                        href={`/trees/${encodeURIComponent(obs.treeId)}`}
                        className="font-medium text-slate-900 hover:text-emerald-700 hover:underline"
                      >
                        {obs.treeId}
                      </Link>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${obsStatus.className}`}
                      >
                        {obs.healthScore}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {obs.heightCm} cm · Pest: {obs.pestPresence} · Water: {obs.wateringStatus}
                    </p>
                  </li>
                );
              })}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
