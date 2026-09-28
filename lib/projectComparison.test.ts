// Copyright 2024 Farm-credit Contributors
// Licensed under the Apache License, Version 2.0

/**
 * Project comparison domain tests
 * Issue #1354: compare offset projects side-by-side.
 */

import {
  COMPARISON_CRITERIA,
  COMPARISON_CRITERION_IDS,
  DEFAULT_COMPARISON_CRITERIA,
  MAX_COMPARE_PROJECTS,
  applyProjectFilters,
  applyProjectSort,
  criterionCellToText,
  describeCriterionValue,
  formatCredits,
  formatPrice,
  getAllProjects,
  getAverageRating,
  getComparisonProjects,
  getCoBenefitIconName,
  getCoBenefitLabel,
  getProjectById,
  getProjects,
  getRiskBadgeColor,
  getRiskColor,
  getRiskIconName,
  inferCoBenefitCategory,
  isComparisonCriterionId,
  normalizeComparisonCriteria,
  normalizeProjectIds,
  toProject,
  type BuyerReview,
  type Project,
} from './projectComparison';
import { mockCarbonProjects } from './api/mock/carbonProjects';

const reviews: BuyerReview[] = [
  {
    id: 'r1',
    projectId: 'p1',
    buyerName: 'A',
    rating: 5,
    title: '',
    content: '',
    verified: true,
    createdAt: '2024-01-01',
  },
  {
    id: 'r2',
    projectId: 'p1',
    buyerName: 'B',
    rating: 4,
    title: '',
    content: '',
    verified: false,
    createdAt: '2024-02-01',
  },
  {
    id: 'r3',
    projectId: 'p1',
    buyerName: 'C',
    rating: 4,
    title: '',
    content: '',
    verified: true,
    createdAt: '2024-03-01',
  },
];

describe('comparison criteria', () => {
  it('covers the six attributes the issue asks for', () => {
    const ids = COMPARISON_CRITERIA.map((criterion) => criterion.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'pricePerTon',
        'coBenefits',
        'methodology',
        'verifier',
        'riskRating',
        'buyerReviews',
      ])
    );
  });

  it('gives every criterion a label, kind and unique id', () => {
    const ids = COMPARISON_CRITERIA.map((criterion) => criterion.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const criterion of COMPARISON_CRITERIA) {
      expect(criterion.label.length).toBeGreaterThan(0);
      expect(criterion.kind.length).toBeGreaterThan(0);
    }
  });

  it('only accepts known criterion ids', () => {
    expect(isComparisonCriterionId('riskRating')).toBe(true);
    expect(isComparisonCriterionId('nope')).toBe(false);
    expect(isComparisonCriterionId(undefined)).toBe(false);
  });

  it('keeps requested criteria in canonical order and drops unknown ones', () => {
    expect(normalizeComparisonCriteria(['buyerReviews', 'nope', 'name', 'buyerReviews'])).toEqual([
      'name',
      'buyerReviews',
    ]);
    expect(normalizeComparisonCriteria([])).toEqual([]);
  });

  it('exports a default column set that is a subset of all criteria', () => {
    expect(DEFAULT_COMPARISON_CRITERIA.length).toBeGreaterThan(0);
    for (const id of DEFAULT_COMPARISON_CRITERIA) {
      expect(COMPARISON_CRITERION_IDS).toContain(id);
    }
  });
});

describe('normalizeProjectIds', () => {
  it('trims, de-duplicates and preserves order', () => {
    expect(normalizeProjectIds([' b ', 'a', 'b', ''])).toEqual(['b', 'a']);
  });

  it('caps the selection at the comparison limit', () => {
    const ids = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7'];
    expect(normalizeProjectIds(ids)).toHaveLength(MAX_COMPARE_PROJECTS);
    expect(normalizeProjectIds(ids)).toEqual(['p1', 'p2', 'p3', 'p4', 'p5']);
  });
});

describe('formatting helpers', () => {
  it('formats price per ton in the project currency', () => {
    expect(formatPrice(45.5, 'USD')).toBe('$45.50');
    expect(formatPrice(10, 'EUR')).toContain('€');
  });

  it('formats credit volumes', () => {
    expect(formatCredits(250000)).toBe('250,000');
    expect(formatCredits(1250.75)).toBe('1,250.75');
  });

  it('averages buyer reviews to one decimal and handles none', () => {
    expect(getAverageRating(reviews)).toBe(4.3);
    expect(getAverageRating([])).toBe(0);
  });

  it('maps each risk rating to distinct colours and icons', () => {
    expect(getRiskColor('low')).toContain('green');
    expect(getRiskColor('medium')).toContain('yellow');
    expect(getRiskColor('high')).toContain('red');
    expect(getRiskBadgeColor('high')).toContain('border-red-200');
    expect(getRiskIconName('low')).toBe('check');
    expect(getRiskIconName('medium')).toBe('alert');
    expect(getRiskIconName('high')).toBe('cross');
  });

  it('maps co-benefit categories to labels and icons', () => {
    expect(getCoBenefitLabel('climate_resilience')).toBe('Climate resilience');
    expect(getCoBenefitIconName('biodiversity')).toBe('leaf');
    expect(getCoBenefitIconName('gender_equality')).toBe('scale');
  });

  it('infers categories from free-text catalogue labels', () => {
    expect(inferCoBenefitCategory('Water Conservation')).toBe('water');
    expect(inferCoBenefitCategory('Soil Health')).toBe('soil');
    expect(inferCoBenefitCategory('Job Creation')).toBe('community');
    expect(inferCoBenefitCategory('Clean Energy')).toBe('climate_resilience');
    expect(inferCoBenefitCategory('Biodiversity')).toBe('biodiversity');
  });
});

describe('catalogue projection', () => {
  it('projects every catalogue project', () => {
    const projects = getAllProjects();
    expect(projects).toHaveLength(mockCarbonProjects.length);
  });

  it('merges the shared catalogue with comparison metadata', () => {
    const project = getProjectById('proj-001');
    expect(project).not.toBeNull();
    expect(project).toMatchObject({
      name: 'Amazon Rainforest Reforestation',
      country: 'Brazil',
      verifier: 'Verra',
      methodology: 'VM0007 REDD+ Methodology Framework',
      riskRating: 'low',
      vintage: '2023',
      totalCredits: 250000,
      currency: 'USD',
    });
    expect(project?.certification).toEqual(expect.arrayContaining(['VCS', 'CCB']));
    expect(project?.buyerReviews.length).toBeGreaterThan(0);
    expect(project?.coBenefits.some((benefit) => benefit.category === 'biodiversity')).toBe(true);
  });

  it('keeps the purchase catalogue as the source of price and supply', () => {
    const source = mockCarbonProjects.find((candidate) => candidate.id === 'proj-004');
    const project = getProjectById('proj-004');
    expect(project?.pricePerTon).toBe(source?.pricePerTon);
    expect(project?.availableCredits).toBe(source?.availableSupply);
    expect(project?.isOutOfStock).toBe(source?.isOutOfStock);
  });

  it('returns null for an unknown id', () => {
    expect(getProjectById('does-not-exist')).toBeNull();
  });

  it('degrades gracefully for a catalogue entry without metadata', () => {
    const [source] = mockCarbonProjects;
    // A catalogue entry with an id the metadata map does not know about.
    const project = toProject({ ...source, id: 'proj-999', location: 'Nairobi, Kenya' });
    expect(project.methodology).toBe('Not specified');
    expect(project.verifier).toBe(source.verificationStatus);
    expect(project.certification).toEqual([source.verificationStatus]);
    expect(project.currency).toBe('USD');
    expect(project.riskRating).toBe('medium');
    expect(project.buyerReviews).toEqual([]);
    expect(project.country).toBe('Kenya');
    // Free-text co-benefits still surface, just unverified.
    expect(project.coBenefits).toHaveLength(source.coBenefits.length);
    expect(project.coBenefits.every((benefit) => benefit.verified === false)).toBe(true);
  });
});

describe('filtering and sorting', () => {
  const projects = getAllProjects();

  it('filters by free-text search across name, location and methodology', () => {
    expect(applyProjectFilters(projects, { search: 'mangrove' }).map((p) => p.id)).toEqual([
      'proj-004',
    ]);
    expect(applyProjectFilters(projects, { search: 'verra' }).map((p) => p.id)).toEqual([
      'proj-001',
      'proj-002',
    ]);
  });

  it('filters by type, country, verifier and risk', () => {
    expect(applyProjectFilters(projects, { projectType: 'Renewable Energy' })).toHaveLength(2);
    expect(applyProjectFilters(projects, { country: 'Kenya' }).map((p) => p.id)).toEqual([
      'proj-005',
    ]);
    expect(applyProjectFilters(projects, { verifier: 'Plan Vivo' }).map((p) => p.id)).toEqual([
      'proj-004',
    ]);
    expect(applyProjectFilters(projects, { riskRating: 'high' }).map((p) => p.id)).toEqual([
      'proj-005',
    ]);
  });

  it('filters by price range and ignores blank bounds', () => {
    const cheap = applyProjectFilters(projects, { maxPrice: 40 });
    expect(cheap.map((p) => p.id)).toEqual(['proj-002', 'proj-005']);
    expect(applyProjectFilters(projects, { minPrice: 50 }).map((p) => p.id)).toEqual(['proj-004']);
    expect(applyProjectFilters(projects, { minPrice: Number.NaN })).toHaveLength(projects.length);
    expect(applyProjectFilters(projects, {})).toHaveLength(projects.length);
  });

  it('sorts numerically and by risk severity', () => {
    expect(applyProjectSort(projects, 'pricePerTon', 'asc').map((p) => p.id)).toEqual([
      'proj-005',
      'proj-002',
      'proj-003',
      'proj-001',
      'proj-004',
    ]);
    expect(applyProjectSort(projects, 'riskRating', 'asc')[0].riskRating).toBe('low');
    expect(applyProjectSort(projects, 'riskRating', 'desc')[0].riskRating).toBe('high');
  });

  it('combines filters with a sort in getProjects', () => {
    const result = getProjects(
      { projectType: 'Renewable Energy' },
      { id: 'pricePerTon', direction: 'asc' }
    );
    expect(result.map((p) => p.id)).toEqual(['proj-002', 'proj-003']);
  });

  it('does not mutate the input array when sorting', () => {
    const input = [...projects];
    applyProjectSort(input, 'pricePerTon', 'desc');
    expect(input.map((p) => p.id)).toEqual(projects.map((p) => p.id));
  });
});

describe('selection resolution', () => {
  it('preserves the order the user selected projects in', () => {
    expect(getComparisonProjects(['proj-004', 'proj-001']).map((p) => p.id)).toEqual([
      'proj-004',
      'proj-001',
    ]);
  });

  it('drops unknown ids instead of failing', () => {
    expect(getComparisonProjects(['proj-001', 'ghost']).map((p) => p.id)).toEqual(['proj-001']);
  });

  it('caps the comparison at the maximum', () => {
    const ids = getAllProjects().map((project) => project.id);
    expect(getComparisonProjects([...ids, 'proj-006'])).toHaveLength(MAX_COMPARE_PROJECTS);
  });
});

describe('cell descriptions', () => {
  const project = getAllProjects()[0];

  it('describes each criterion without touching the DOM', () => {
    expect(describeCriterionValue(project, 'pricePerTon')).toEqual({
      kind: 'price',
      amount: project.pricePerTon,
      currency: 'USD',
    });
    expect(describeCriterionValue(project, 'riskRating')).toEqual({
      kind: 'risk',
      rating: project.riskRating,
    });
    expect(describeCriterionValue(project, 'certification').kind).toBe('tags');
    expect(describeCriterionValue(project, 'coBenefits').kind).toBe('benefits');
    expect(describeCriterionValue(project, 'methodology')).toEqual({
      kind: 'text',
      text: project.methodology,
    });
    expect(describeCriterionValue(project, 'buyerReviews')).toEqual({
      kind: 'reviews',
      average: getAverageRating(project.buyerReviews),
      count: project.buyerReviews.length,
    });
  });

  it('renders a text form for CSV and tooltips', () => {
    expect(criterionCellToText({ kind: 'price', amount: 45.5, currency: 'USD' })).toBe('$45.50');
    expect(criterionCellToText({ kind: 'risk', rating: 'low' })).toBe('low');
    expect(criterionCellToText({ kind: 'tags', tags: ['VCS', 'CCB'] })).toBe('VCS; CCB');
    expect(criterionCellToText({ kind: 'reviews', average: 4.3, count: 3 })).toBe('4.3 (3)');
    expect(criterionCellToText({ kind: 'reviews', average: 0, count: 0 })).toBe('No reviews');
    expect(criterionCellToText({ kind: 'credits', available: 1250.75, total: 250000 })).toBe(
      '1,250.75 / 250,000'
    );
    expect(criterionCellToText({ kind: 'credits', available: 10, total: 0 })).toBe('10');
    expect(
      criterionCellToText({
        kind: 'benefits',
        benefits: [{ category: 'water', description: 'x', verified: true }],
      })
    ).toBe('Water');
  });

  it('never throws for any criterion on any catalogue project', () => {
    for (const candidate of getAllProjects() as Project[]) {
      for (const id of COMPARISON_CRITERION_IDS) {
        expect(criterionCellToText(describeCriterionValue(candidate, id))).toEqual(
          expect.any(String)
        );
      }
    }
  });
});
