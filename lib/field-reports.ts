/**
 * Automated weekly field reports — Issue #1692.
 *
 * Compiles the field team's individual health observations into one structured
 * report per project area per week, with a health table, photos and flagged
 * anomalies, then emails it to the project manager and platform admin.
 *
 * Storage is in-process (like `lib/api/tree-health.ts`); swap the array for a
 * database without changing the routes.
 */
import { listAllHealthObservations } from '@/lib/api/tree-health';
import { getTreeById } from '@/lib/api/tree-registry';
import { sendFieldReportEmail } from '@/lib/email/sendgrid';
import {
  ALERTABLE_HEALTH_CAUSES,
  HEALTH_ALERT_DROP_THRESHOLD,
  HEALTH_CAUSE_LABELS,
  type TreeHealthObservation,
} from '@/lib/types/tree-health';

/** A health score below this is flagged as an anomaly regardless of trend. */
export const CRITICAL_HEALTH_SCORE = 40;

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export type AnomalyReason = 'critical_score' | 'sharp_drop' | 'alertable_cause';

export interface FieldReportRow {
  treeId: string;
  species: string;
  score: number;
  previousScore: number | null;
  cause: string | null;
  note: string | null;
  recordedAt: string;
}

export interface FieldReportAnomaly extends FieldReportRow {
  reasons: AnomalyReason[];
}

export interface FieldReportPhoto {
  treeId: string;
  url: string;
}

export interface FieldReport {
  id: string;
  projectArea: string;
  weekStart: string;
  weekEnd: string;
  generatedAt: string;
  observationCount: number;
  treesObserved: number;
  averageScore: number;
  rows: FieldReportRow[];
  photos: FieldReportPhoto[];
  anomalies: FieldReportAnomaly[];
  sharedWith: string[];
}

export interface ObservedTree {
  species: string;
  projectArea: string;
}

/** Start (Monday 00:00 UTC) of the week containing `date`. */
export function startOfWeek(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const sinceMonday = (d.getUTCDay() + 6) % 7;
  return new Date(d.getTime() - sinceMonday * 24 * 60 * 60 * 1000);
}

/** The most recent fully elapsed week relative to `now`. */
export function previousWeekStart(now: Date): Date {
  return new Date(startOfWeek(now).getTime() - WEEK_MS);
}

export function classifyAnomaly(
  observation: Pick<TreeHealthObservation, 'score' | 'cause'>,
  previousScore: number | null
): AnomalyReason[] {
  const reasons: AnomalyReason[] = [];
  if (observation.score < CRITICAL_HEALTH_SCORE) reasons.push('critical_score');
  if (previousScore !== null && previousScore - observation.score > HEALTH_ALERT_DROP_THRESHOLD) {
    reasons.push('sharp_drop');
  }
  if (observation.cause && ALERTABLE_HEALTH_CAUSES.includes(observation.cause)) {
    reasons.push('alertable_cause');
  }
  return reasons;
}

/**
 * Pure report builder: groups the observations recorded in the week starting
 * `weekStart` by project area. Trees missing from `trees` are skipped.
 */
export function buildWeeklyFieldReports(
  observations: readonly TreeHealthObservation[],
  trees: ReadonlyMap<string, ObservedTree>,
  weekStart: Date,
  generatedAt: Date = new Date()
): FieldReport[] {
  const start = weekStart.getTime();
  const end = start + WEEK_MS;

  const byTree = new Map<string, TreeHealthObservation[]>();
  for (const obs of observations) {
    const list = byTree.get(obs.treeId) ?? [];
    list.push(obs);
    byTree.set(obs.treeId, list);
  }

  const byArea = new Map<string, FieldReport>();
  for (const [treeId, history] of byTree) {
    const tree = trees.get(treeId);
    if (!tree) continue;
    const sorted = [...history].sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));

    sorted.forEach((obs, index) => {
      const at = Date.parse(obs.recordedAt);
      if (!(at >= start && at < end)) return;
      const previousScore = index > 0 ? sorted[index - 1].score : null;

      let report = byArea.get(tree.projectArea);
      if (!report) {
        report = {
          id: `fr-${tree.projectArea.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${weekStart
            .toISOString()
            .slice(0, 10)}`,
          projectArea: tree.projectArea,
          weekStart: weekStart.toISOString(),
          weekEnd: new Date(end).toISOString(),
          generatedAt: generatedAt.toISOString(),
          observationCount: 0,
          treesObserved: 0,
          averageScore: 0,
          rows: [],
          photos: [],
          anomalies: [],
          sharedWith: [],
        };
        byArea.set(tree.projectArea, report);
      }

      const row: FieldReportRow = {
        treeId,
        species: tree.species,
        score: obs.score,
        previousScore,
        cause: obs.cause ? HEALTH_CAUSE_LABELS[obs.cause] : null,
        note: obs.note,
        recordedAt: obs.recordedAt,
      };
      report.rows.push(row);
      for (const url of obs.photoUrls ?? []) report.photos.push({ treeId, url });
      const reasons = classifyAnomaly(obs, previousScore);
      if (reasons.length > 0) report.anomalies.push({ ...row, reasons });
    });
  }

  const reports = [...byArea.values()];
  for (const report of reports) {
    report.observationCount = report.rows.length;
    report.treesObserved = new Set(report.rows.map((r) => r.treeId)).size;
    report.averageScore = Math.round(
      report.rows.reduce((sum, r) => sum + r.score, 0) / report.rows.length
    );
  }
  return reports.sort((a, b) => a.projectArea.localeCompare(b.projectArea));
}

const ANOMALY_LABELS: Record<AnomalyReason, string> = {
  critical_score: `health below ${CRITICAL_HEALTH_SCORE}`,
  sharp_drop: `drop of more than ${HEALTH_ALERT_DROP_THRESHOLD} points`,
  alertable_cause: 'pest damage or drought stress',
};

export function describeAnomaly(anomaly: FieldReportAnomaly): string {
  return anomaly.reasons.map((r) => ANOMALY_LABELS[r]).join(', ');
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>'"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[c] ?? c
  );
}

function periodLabel(report: FieldReport): string {
  return `${report.weekStart.slice(0, 10)} to ${new Date(Date.parse(report.weekEnd) - 1)
    .toISOString()
    .slice(0, 10)}`;
}

export function renderFieldReportText(report: FieldReport): string {
  const lines = [
    `Weekly field report — ${report.projectArea} (${periodLabel(report)})`,
    `${report.observationCount} observations across ${report.treesObserved} trees; average health ${report.averageScore}/100.`,
    '',
    'Health observations',
    ...report.rows.map(
      (r) =>
        `- ${r.treeId} (${r.species}): ${r.score}/100${r.cause ? `, ${r.cause}` : ''}${
          r.note ? ` — ${r.note}` : ''
        }`
    ),
    '',
    `Anomalies flagged (${report.anomalies.length})`,
    ...(report.anomalies.length === 0
      ? ['- None']
      : report.anomalies.map((a) => `- ${a.treeId}: ${a.score}/100 (${describeAnomaly(a)})`)),
    '',
    `Photos (${report.photos.length})`,
    ...report.photos.map((p) => `- ${p.treeId}: ${p.url}`),
  ];
  return lines.join('\n');
}

export function renderFieldReportHtml(report: FieldReport): string {
  const rows = report.rows
    .map(
      (r) =>
        `<tr><td>${escapeHtml(r.treeId)}</td><td>${escapeHtml(r.species)}</td><td>${r.score}</td><td>${
          r.previousScore ?? '—'
        }</td><td>${escapeHtml(r.cause ?? '—')}</td><td>${escapeHtml(r.note ?? '')}</td></tr>`
    )
    .join('');
  const anomalies =
    report.anomalies.length === 0
      ? '<p>No anomalies flagged this week.</p>'
      : `<ul>${report.anomalies
          .map(
            (a) =>
              `<li><strong>${escapeHtml(a.treeId)}</strong>: ${a.score}/100 (${escapeHtml(
                describeAnomaly(a)
              )})</li>`
          )
          .join('')}</ul>`;
  const photos = report.photos
    .map(
      (p) =>
        `<a href="${escapeHtml(p.url)}"><img src="${escapeHtml(p.url)}" alt="Tree ${escapeHtml(
          p.treeId
        )}" width="160" style="margin:4px"/></a>`
    )
    .join('');
  return [
    `<h2>Weekly field report — ${escapeHtml(report.projectArea)}</h2>`,
    `<p>${periodLabel(report)} · ${report.observationCount} observations across ${report.treesObserved} trees · average health ${report.averageScore}/100</p>`,
    '<h3>Health observations</h3>',
    `<table border="1" cellpadding="6" cellspacing="0"><thead><tr><th>Tree</th><th>Species</th><th>Score</th><th>Previous</th><th>Cause</th><th>Note</th></tr></thead><tbody>${rows}</tbody></table>`,
    `<h3>Anomalies flagged (${report.anomalies.length})</h3>`,
    anomalies,
    `<h3>Photos (${report.photos.length})</h3>`,
    photos || '<p>No photos this week.</p>',
  ].join('');
}

const reports: FieldReport[] = [];

export function listFieldReports(filter: { projectArea?: string } = {}): FieldReport[] {
  return reports.filter((r) => !filter.projectArea || r.projectArea === filter.projectArea);
}

export function getFieldReport(id: string): FieldReport | undefined {
  return reports.find((r) => r.id === id);
}

/** Recipients for a report: the area's project manager and the platform admin. */
export function resolveReportRecipients(
  projectArea: string,
  env: NodeJS.ProcessEnv = process.env
): string[] {
  const recipients = new Set<string>();
  let managers: Record<string, string> = {};
  try {
    managers = JSON.parse(env.FIELD_REPORT_PROJECT_MANAGERS ?? '{}') as Record<string, string>;
  } catch {
    managers = {};
  }
  const manager = managers[projectArea] ?? env.FIELD_REPORT_PROJECT_MANAGER_EMAIL;
  if (manager?.trim()) recipients.add(manager.trim());
  const admin = env.FIELD_REPORT_PLATFORM_ADMIN_EMAIL;
  if (admin?.trim()) recipients.add(admin.trim());
  return [...recipients];
}

async function shareReport(report: FieldReport): Promise<void> {
  const recipients = resolveReportRecipients(report.projectArea);
  const subject = `Weekly field report: ${report.projectArea} (${periodLabel(report)})`;
  const text = renderFieldReportText(report);
  const html = renderFieldReportHtml(report);
  for (const to of recipients) {
    await sendFieldReportEmail({ to, subject, text, html });
  }
  report.sharedWith = recipients;
}

export interface GenerateOptions {
  weekStart?: Date;
  now?: Date;
  share?: boolean;
}

/**
 * Generates (or regenerates) the weekly report for every project area that has
 * observations, stores them, and shares them with their recipients.
 */
export async function generateWeeklyFieldReports(
  options: GenerateOptions = {}
): Promise<FieldReport[]> {
  const now = options.now ?? new Date();
  const weekStart = options.weekStart ?? previousWeekStart(now);
  const observations = listAllHealthObservations();

  const trees = new Map<string, ObservedTree>();
  for (const treeId of new Set(observations.map((o) => o.treeId))) {
    const tree = await getTreeById(treeId);
    if (tree) trees.set(treeId, { species: tree.species, projectArea: tree.region });
  }

  const generated = buildWeeklyFieldReports(observations, trees, weekStart, now);
  for (const report of generated) {
    const existing = reports.findIndex((r) => r.id === report.id);
    if (existing >= 0) reports.splice(existing, 1);
    reports.push(report);
    if (options.share !== false) await shareReport(report);
  }
  return generated;
}

export function resetFieldReportsForTest(): void {
  reports.length = 0;
}
