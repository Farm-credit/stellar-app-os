import { describe, expect, it } from 'vitest';
import {
  buildWeeklyFieldReports,
  classifyAnomaly,
  previousWeekStart,
  renderFieldReportHtml,
  renderFieldReportText,
  resolveReportRecipients,
  startOfWeek,
  type ObservedTree,
} from '../field-reports';
import type { TreeHealthObservation } from '@/lib/types/tree-health';

const WEEK = new Date('2026-10-12T00:00:00.000Z'); // Monday

function obs(
  id: string,
  treeId: string,
  score: number,
  recordedAt: string,
  extra: Partial<TreeHealthObservation> = {}
): TreeHealthObservation {
  return { id, treeId, score, cause: null, remediation: [], note: null, recordedAt, ...extra };
}

const trees = new Map<string, ObservedTree>([
  ['t1', { species: 'Baobab', projectArea: 'Kano' }],
  ['t2', { species: 'Neem', projectArea: 'Kano' }],
  ['t3', { species: 'Teak', projectArea: 'Lagos' }],
]);

describe('field report weeks (#1692)', () => {
  it('finds the Monday that starts a week', () => {
    expect(startOfWeek(new Date('2026-10-18T23:00:00Z')).toISOString()).toBe(
      '2026-10-12T00:00:00.000Z'
    );
    expect(previousWeekStart(new Date('2026-10-21T10:00:00Z')).toISOString()).toBe(
      '2026-10-12T00:00:00.000Z'
    );
  });
});

describe('classifyAnomaly', () => {
  it('flags low scores, sharp drops and alertable causes', () => {
    expect(classifyAnomaly({ score: 30, cause: null }, null)).toEqual(['critical_score']);
    expect(classifyAnomaly({ score: 60, cause: null }, 90)).toEqual(['sharp_drop']);
    expect(classifyAnomaly({ score: 70, cause: 'pest_damage' }, 75)).toEqual(['alertable_cause']);
    expect(classifyAnomaly({ score: 80, cause: null }, 85)).toEqual([]);
  });
});

describe('buildWeeklyFieldReports', () => {
  const observations = [
    obs('o0', 't1', 95, '2026-10-05T09:00:00Z'), // prior week, baseline only
    obs('o1', 't1', 60, '2026-10-13T09:00:00Z', {
      cause: 'drought_stress',
      photoUrls: ['https://img.example/a.jpg'],
      note: 'dry <soil>',
    }),
    obs('o2', 't2', 85, '2026-10-14T09:00:00Z'),
    obs('o3', 't3', 35, '2026-10-15T09:00:00Z'),
    obs('o4', 't3', 90, '2026-10-30T09:00:00Z'), // outside the week
  ];

  it('groups observations by project area for the week only', () => {
    const reports = buildWeeklyFieldReports(observations, trees, WEEK);
    expect(reports.map((r) => r.projectArea)).toEqual(['Kano', 'Lagos']);
    const kano = reports[0];
    expect(kano.observationCount).toBe(2);
    expect(kano.treesObserved).toBe(2);
    expect(kano.averageScore).toBe(73);
    expect(reports[1].observationCount).toBe(1);
  });

  it('includes photos and anomalies', () => {
    const [kano, lagos] = buildWeeklyFieldReports(observations, trees, WEEK);
    expect(kano.photos).toEqual([{ treeId: 't1', url: 'https://img.example/a.jpg' }]);
    expect(kano.anomalies).toHaveLength(1);
    expect(kano.anomalies[0].reasons).toEqual(['sharp_drop', 'alertable_cause']);
    expect(lagos.anomalies[0].reasons).toEqual(['critical_score']);
  });

  it('produces no report when nothing was observed', () => {
    expect(buildWeeklyFieldReports([], trees, WEEK)).toEqual([]);
  });

  it('renders tables and escapes field notes', () => {
    const [kano] = buildWeeklyFieldReports(observations, trees, WEEK);
    const html = renderFieldReportHtml(kano);
    expect(html).toContain('<table');
    expect(html).toContain('&lt;soil&gt;');
    expect(html).not.toContain('<soil>');
    expect(renderFieldReportText(kano)).toContain('Anomalies flagged (1)');
  });
});

describe('resolveReportRecipients', () => {
  it('shares with the area manager and the platform admin', () => {
    const env = {
      FIELD_REPORT_PROJECT_MANAGERS: '{"Kano":"kano-pm@example.org"}',
      FIELD_REPORT_PROJECT_MANAGER_EMAIL: 'default-pm@example.org',
      FIELD_REPORT_PLATFORM_ADMIN_EMAIL: 'admin@example.org',
    } as unknown as NodeJS.ProcessEnv;
    expect(resolveReportRecipients('Kano', env)).toEqual([
      'kano-pm@example.org',
      'admin@example.org',
    ]);
    expect(resolveReportRecipients('Lagos', env)).toEqual([
      'default-pm@example.org',
      'admin@example.org',
    ]);
  });
});
