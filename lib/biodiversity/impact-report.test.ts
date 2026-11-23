/**
 * Tests for the annual biodiversity impact report (issue #1630).
 *
 * The report is a pure projection over field submissions, so every case here
 * feeds fixtures straight from the census and wildlife shapes and asserts the
 * derived numbers the PDF and the project page display.
 */

import { describe, expect, it } from 'vitest';

import type { TreeCensusSubmission } from '@/lib/census/types';
import type { WildlifeSighting } from '@/lib/wildlife/types';
import {
  MIN_REPORT_YEAR,
  buildAnnualBiodiversityReport,
  buildAnnualReportSeries,
  collectReportYears,
  getAnnualReportCadence,
  parseReportYear,
} from './impact-report';

const NOW = new Date('2026-03-01T00:00:00.000Z');

function census(overrides: Partial<TreeCensusSubmission> = {}): TreeCensusSubmission {
  return {
    id: 'census-1',
    projectId: 'proj-001',
    projectName: 'Kaduna Forest',
    censusYear: 2025,
    surveyorName: 'Ada Field Team',
    surveyorAgentId: 'agent-1',
    submittedAt: '2025-06-01T09:00:00.000Z',
    totalTreesCounted: 100,
    aliveCount: 93,
    deadCount: 7,
    survivalRate: 93,
    averageHeightCm: 180,
    averageHealthScore: 82,
    healthDistribution: { thriving: 70, moderate: 20, critical: 3, dead: 7 },
    speciesBreakdown: [
      {
        species: 'Oak',
        total: 60,
        alive: 60,
        dead: 0,
        survivalRate: 100,
        avgHeightCm: 200,
        avgHealthScore: 88,
      },
      {
        species: 'Pine',
        total: 30,
        alive: 25,
        dead: 5,
        survivalRate: 83.3,
        avgHeightCm: 160,
        avgHealthScore: 74,
      },
      {
        species: 'Maple',
        total: 10,
        alive: 8,
        dead: 2,
        survivalRate: 80,
        avgHeightCm: 150,
        avgHealthScore: 70,
      },
    ],
    records: [],
    ...overrides,
  };
}

function sighting(overrides: Partial<WildlifeSighting> = {}): WildlifeSighting {
  return {
    id: 'sighting-1',
    projectId: 'proj-001',
    speciesCommonName: 'Hornbill',
    scientificName: 'Bucorvus leadbeateri',
    taxonomicGroup: 'bird',
    count: 4,
    observedAt: '2025-03-12T08:00:00.000Z',
    submittedBy: 'Ada Field Team',
    submitterRole: 'field_team',
    status: 'approved',
    createdAt: '2025-03-12T08:00:00.000Z',
    ...overrides,
  };
}

const SIGHTINGS_2025 = [
  sighting({ id: 's1', speciesCommonName: 'Hornbill', count: 4 }),
  sighting({
    id: 's2',
    speciesCommonName: 'Leopard',
    scientificName: 'Panthera pardus',
    taxonomicGroup: 'mammal',
    count: 2,
    observedAt: '2025-05-01T06:30:00.000Z',
  }),
  sighting({
    id: 's3',
    speciesCommonName: 'African Grey Parrot',
    taxonomicGroup: 'bird',
    count: 1,
    observedAt: '2025-09-20T16:00:00.000Z',
  }),
  sighting({
    id: 's4',
    speciesCommonName: 'Tree Frog',
    taxonomicGroup: 'amphibian',
    count: 3,
    status: 'pending',
    submitterRole: 'citizen_scientist',
    observedAt: '2025-07-04T20:00:00.000Z',
  }),
];

describe('buildAnnualBiodiversityReport', () => {
  it('computes the Shannon index from the annual census species breakdown', () => {
    const report = buildAnnualBiodiversityReport({
      projectId: 'proj-001',
      year: 2025,
      censusSubmissions: [census()],
      sightings: [],
      generatedAt: NOW,
    });

    // 60/25/8 living stems of 93 → p = 0.6452/0.2688/0.0860 → H′ = 0.8468
    expect(report.diversity.source).toBe('census');
    expect(report.diversity.speciesRichness).toBe(3);
    expect(report.diversity.totalIndividuals).toBe(93);
    expect(report.diversity.shannonIndex).toBeCloseTo(0.85, 2);
    expect(report.diversity.evenness).toBeGreaterThan(0.7);
    expect(report.diversity.evenness).toBeLessThanOrEqual(1);
    expect(report.diversity.interpretation).toContain('diversity');
  });

  it('sums living stems across multiple submissions in the same year', () => {
    const report = buildAnnualBiodiversityReport({
      projectId: 'proj-001',
      year: 2025,
      censusSubmissions: [
        census({ id: 'a' }),
        census({
          id: 'b',
          surveyorName: 'Bello Field Team',
          totalTreesCounted: 40,
          aliveCount: 40,
          averageHealthScore: 90,
          speciesBreakdown: [
            {
              species: 'Oak',
              total: 40,
              alive: 40,
              dead: 0,
              survivalRate: 100,
              avgHeightCm: 190,
              avgHealthScore: 90,
            },
          ],
        }),
      ],
      sightings: [],
      generatedAt: NOW,
    });

    expect(report.diversity.totalIndividuals).toBe(133);
    expect(report.diversity.speciesRichness).toBe(3);
    expect(report.coverage.censusSubmissions).toBe(2);
    expect(report.coverage.surveyors).toEqual(['Ada Field Team', 'Bello Field Team']);
    expect(report.coverage.treesCounted).toBe(140);
  });

  it('falls back to wildlife sighting counts when a year has no census', () => {
    const report = buildAnnualBiodiversityReport({
      projectId: 'proj-001',
      year: 2025,
      censusSubmissions: [],
      sightings: SIGHTINGS_2025,
      generatedAt: NOW,
    });

    // Approved only: Hornbill 4, Leopard 2, Parrot 1 — the pending frog is excluded.
    expect(report.diversity.source).toBe('wildlife');
    expect(report.diversity.speciesRichness).toBe(3);
    expect(report.diversity.totalIndividuals).toBe(7);
    expect(report.diversity.shannonIndex).toBeGreaterThan(0.9);
    expect(report.diversity.shannonIndex).toBeLessThan(1);
  });

  it('reports no data without inventing a diversity index', () => {
    const report = buildAnnualBiodiversityReport({
      projectId: 'proj-001',
      year: 2025,
      censusSubmissions: [],
      sightings: [],
      generatedAt: NOW,
    });

    expect(report.diversity).toMatchObject({
      shannonIndex: 0,
      speciesRichness: 0,
      totalIndividuals: 0,
      source: 'none',
    });
    expect(report.recovery.treeSurvivalRate).toBeNull();
    expect(report.recovery.habitatQualityScore).toBeNull();
    expect(report.recovery.recoveryStatus).toBeNull();
    expect(report.sourceSubmissionCount).toBe(0);
    expect(report.wildlife.totalSightings).toBe(0);
    expect(report.baselineComparison).toBeNull();
  });

  it('summarises wildlife sightings by group and separates pending review', () => {
    const report = buildAnnualBiodiversityReport({
      projectId: 'proj-001',
      year: 2025,
      censusSubmissions: [census()],
      sightings: SIGHTINGS_2025,
      generatedAt: NOW,
    });

    expect(report.wildlife).toMatchObject({
      totalSightings: 4,
      approvedSightings: 3,
      pendingSightings: 1,
      speciesRichness: 3,
      individualsObserved: 7,
    });
    expect(report.wildlife.byGroup).toEqual([
      { taxonomicGroup: 'bird', speciesCount: 2, individualCount: 5 },
      { taxonomicGroup: 'mammal', speciesCount: 1, individualCount: 2 },
    ]);
    expect(report.wildlife.notableSpecies.map((species) => species.commonName)).toEqual([
      'Hornbill',
      'Leopard',
      'African Grey Parrot',
    ]);
    expect(report.wildlife.notableSpecies[0]).toMatchObject({
      scientificName: 'Bucorvus leadbeateri',
      individualCount: 4,
      sightingCount: 1,
    });
  });

  it('ignores submissions from other years and other projects data windows', () => {
    const report = buildAnnualBiodiversityReport({
      projectId: 'proj-001',
      year: 2025,
      censusSubmissions: [
        census({ id: '2024', censusYear: 2024, submittedAt: '2024-05-01T00:00:00.000Z' }),
        census({ id: '2025', censusYear: 2025 }),
      ],
      sightings: [
        ...SIGHTINGS_2025,
        sighting({ id: '2024-sighting', observedAt: '2024-12-31T23:59:00.000Z', count: 9 }),
      ],
      generatedAt: NOW,
    });

    expect(report.coverage.censusSubmissions).toBe(1);
    expect(report.wildlife.individualsObserved).toBe(7);
    expect(report.periodStart).toBe('2025-01-01T00:00:00.000Z');
    expect(report.periodEnd).toBe('2026-01-01T00:00:00.000Z');
  });

  it('derives survival, health and habitat recovery indicators', () => {
    const report = buildAnnualBiodiversityReport({
      projectId: 'proj-001',
      year: 2025,
      censusSubmissions: [census()],
      sightings: SIGHTINGS_2025,
      generatedAt: NOW,
    });

    expect(report.recovery.treeSurvivalRate).toBe(93);
    expect(report.recovery.averageTreeHealthScore).toBe(82);
    expect(report.recovery.wildlifeSpeciesRichness).toBe(3);
    expect(report.recovery.habitatQualityScore).toBeGreaterThan(40);
    expect(report.recovery.habitatQualityScore).toBeLessThan(70);
    expect(report.recovery.habitatInterpretation).toMatch(/habitat quality/i);
    // 93 survival is a "recovered"-band signal but the composite includes habitat.
    expect(report.recovery.recoveryStatus).not.toBeNull();
    expect(report.recovery.indicators.map((indicator) => indicator.key)).toEqual([
      'tree_survival',
      'tree_health',
      'wildlife_richness',
      'habitat_quality',
      'diversity_trend',
    ]);
    // No previous report: nothing to compare against yet.
    expect(report.recovery.indicators.every((indicator) => indicator.trend === 'unknown')).toBe(
      true
    );
  });

  it('marks ended years final and the ongoing year in progress', () => {
    const past = buildAnnualBiodiversityReport({
      projectId: 'proj-001',
      year: 2025,
      censusSubmissions: [census()],
      sightings: [],
      generatedAt: NOW,
    });
    const ongoing = buildAnnualBiodiversityReport({
      projectId: 'proj-001',
      year: 2026,
      censusSubmissions: [],
      sightings: [sighting({ observedAt: '2026-02-01T00:00:00.000Z' })],
      generatedAt: NOW,
    });

    expect(past.status).toBe('final');
    expect(ongoing.status).toBe('in_progress');
    expect(ongoing.pdfUrl).toBe('/api/projects/proj-001/biodiversity-report/2026/pdf');
  });

  it('exposes the documented methodology in each report', () => {
    const report = buildAnnualBiodiversityReport({
      projectId: 'proj-001',
      year: 2025,
      censusSubmissions: [census()],
      sightings: [],
      generatedAt: NOW,
    });

    expect(report.methodology.length).toBeGreaterThanOrEqual(4);
    expect(report.methodology.join(' ')).toContain('Shannon');
  });
});

describe('buildAnnualReportSeries', () => {
  const years = [2024, 2025, 2026];

  function series() {
    return buildAnnualReportSeries({
      projectId: 'proj-001',
      generatedAt: NOW,
      censusSubmissions: [
        census({
          id: '2024',
          censusYear: 2024,
          totalTreesCounted: 100,
          aliveCount: 80,
          averageHealthScore: 70,
          speciesBreakdown: [
            {
              species: 'Oak',
              total: 100,
              alive: 80,
              dead: 20,
              survivalRate: 80,
              avgHeightCm: 150,
              avgHealthScore: 70,
            },
          ],
        }),
        census({ id: '2025', censusYear: 2025 }),
        census({
          id: '2026',
          censusYear: 2026,
          totalTreesCounted: 120,
          aliveCount: 118,
          averageHealthScore: 90,
        }),
      ],
      sightings: SIGHTINGS_2025,
    });
  }

  it('returns one report per data year, newest first', () => {
    const reports = series();
    expect(reports.map((report) => report.year)).toEqual([2026, 2025, 2024]);
    expect(years).toContain(reports[0].year);
  });

  it('compares each year to the first year and to the year before', () => {
    const reports = series();
    const [latest, middle, first] = reports;

    expect(first.baselineComparison).toBeNull();
    expect(first.previousYear).toBeNull();

    expect(middle.baselineComparison).toMatchObject({
      baselineYear: 2024,
      baselineShannonIndex: 0,
      trend: 'stable',
    });

    expect(latest.previousYear).toEqual({
      year: 2025,
      shannonIndex: middle.diversity.shannonIndex,
      changePercent: expect.any(Number),
    });
    expect(latest.baselineComparison?.baselineYear).toBe(2024);
    expect(latest.baselineComparison?.summary).toContain('since 2024');
  });

  it('reports year-on-year indicator trends once a previous year exists', () => {
    const [latest] = series();
    const survival = latest.recovery.indicators.find(
      (indicator) => indicator.key === 'tree_survival'
    );
    const health = latest.recovery.indicators.find((indicator) => indicator.key === 'tree_health');

    // 2025 survived 93% → 2026 survives 98.3%
    expect(survival?.value).toBe(98.3);
    expect(survival?.trend).toBe('increasing');
    expect(health?.value).toBe(90);
    expect(health?.trend).toBe('increasing');
  });
});

describe('collectReportYears', () => {
  it('unions census years and sighting years, ascending', () => {
    expect(
      collectReportYears(
        [census({ censusYear: 2024 }), census({ id: 'c2', censusYear: 2026 })],
        [
          sighting({ observedAt: '2025-04-04T00:00:00.000Z' }),
          sighting({ id: 's2', observedAt: '2026-01-02T00:00:00.000Z' }),
        ]
      )
    ).toEqual([2024, 2025, 2026]);
  });

  it('returns an empty list when no submissions exist', () => {
    expect(collectReportYears([], [])).toEqual([]);
  });
});

describe('getAnnualReportCadence', () => {
  it('describes the annual cadence and the ongoing year', () => {
    const reports = buildAnnualReportSeries({
      projectId: 'proj-001',
      generatedAt: NOW,
      years: [2024, 2025, 2026],
      censusSubmissions: [census({ censusYear: 2024 }), census({ id: 'c2', censusYear: 2025 })],
      sightings: [sighting({ observedAt: '2026-01-15T00:00:00.000Z' })],
    });

    expect(getAnnualReportCadence(reports, NOW)).toEqual({
      currentReportYear: 2026,
      lastFinalYear: 2025,
      finalizationDate: '2027-01-01T00:00:00.000Z',
      availableYears: [2026, 2025, 2024],
      currentYearHasData: true,
    });
  });

  it('reports no finalised year before any year has ended', () => {
    const reports = buildAnnualReportSeries({
      projectId: 'proj-001',
      generatedAt: NOW,
      censusSubmissions: [census({ censusYear: 2026 })],
      sightings: [],
    });

    const cadence = getAnnualReportCadence(reports, NOW);
    expect(cadence.lastFinalYear).toBeNull();
    expect(cadence.currentYearHasData).toBe(true);
  });
});

describe('parseReportYear', () => {
  it('accepts a plausible year', () => {
    expect(parseReportYear('2025', NOW)).toEqual({ ok: true, value: 2025 });
    expect(parseReportYear(2026, NOW)).toEqual({ ok: true, value: 2026 });
  });

  it('rejects years outside the reportable window', () => {
    for (const value of ['1999', '2027', 'abc', '2025.5', '', null]) {
      const result = parseReportYear(value, NOW);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('invalid_year');
        expect(result.message).toContain(String(MIN_REPORT_YEAR));
      }
    }
  });
});
