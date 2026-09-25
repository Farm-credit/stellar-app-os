// Copyright 2024 Farm-credit Contributors
// Licensed under the Apache License, Version 2.0

/**
 * Project Comparison Tests
 * Issue #1416
 */

import { 
  Project, 
  CoBenefit, 
  BuyerReview, 
  ComparisonCriteria, 
  COMPARISON_CRITERIA,
  getRiskColor,
  getRiskIcon,
  formatPrice,
  getAverageRating,
  getCoBenefitIcon,
} from './projectComparison';

describe('Project Comparison Types', () => {
  const sampleProject: Project = {
    id: 'proj-1',
    name: 'Amazon Reforestation',
    description: 'Large-scale reforestation in the Amazon',
    location: 'Amazon Basin',
    country: 'Brazil',
    projectType: 'reforestation',
    methodology: 'VM0001',
    verifier: 'Verra',
    certification: ['VCS', 'CCB'],
    pricePerTon: 15.50,
    currency: 'USD',
    vintage: '2023',
    totalCredits: 100000,
    availableCredits: 50000,
    riskRating: 'low',
    coBenefits: [
      { category: 'biodiversity', description: 'Protects endangered species habitat', verified: true },
      { category: 'community', description: 'Employs 200 local workers', verified: true },
    ],
    images: ['image1.jpg'],
    buyerReviews: [
      { id: 'rev-1', projectId: 'proj-1', buyerName: 'Green Corp', rating: 5, title: 'Excellent', content: 'Great project', verified: true, createdAt: '2024-01-01' },
      { id: 'rev-2', projectId: 'proj-1', buyerName: 'Eco Inc', rating: 4, title: 'Good', content: 'Solid project', verified: true, createdAt: '2024-02-01' },
    ],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  };

  it('should have valid Project interface', () => {
    expect(sampleProject.name).toBe('Amazon Reforestation');
    expect(sampleProject.pricePerTon).toBe(15.50);
    expect(sampleProject.riskRating).toBe('low');
  });

  it('should have valid CoBenefit interface', () => {
    const coBenefit: CoBenefit = {
      category: 'biodiversity',
      description: 'Protects habitat',
      verified: true,
    };
    expect(coBenefit.category).toBe('biodiversity');
  });

  it('should have valid BuyerReview interface', () => {
    const review: BuyerReview = {
      id: 'rev-1',
      projectId: 'proj-1',
      buyerName: 'Test Corp',
      rating: 5,
      title: 'Great',
      content: 'Great project',
      verified: true,
      createdAt: '2024-01-01',
    };
    expect(review.rating).toBe(5);
  });

  it('should have comparison criteria defined', () => {
    expect(COMPARISON_CRITERIA.length).toBeGreaterThan(10);
    expect(COMPARISON_CRITERIA.some(c => c.id === 'pricePerTon')).toBe(true);
    expect(COMPARISON_CRITERIA.some(c => c.id === 'riskRating')).toBe(true);
    expect(COMPARISON_CRITERIA.some(c => c.id === 'coBenefits')).toBe(true);
  });

  it('should return correct risk colors', () => {
    expect(getRiskColor('low')).toContain('green');
    expect(getRiskColor('medium')).toContain('yellow');
    expect(getRiskColor('high')).toContain('red');
  });

  it('should format price correctly', () => {
    expect(formatPrice(15.50, 'USD')).toContain('$15.50');
    expect(formatPrice(100, 'EUR')).toContain('€');
  });

  it('should calculate average rating', () => {
    const reviews: BuyerReview[] = [
      { id: '1', projectId: 'p1', buyerName: 'A', rating: 5, title: '', content: '', verified: true, createdAt: '' },
      { id: '2', projectId: 'p1', buyerName: 'B', rating: 3, title: '', content: '', verified: true, createdAt: '' },
    ];
    expect(getAverageRating(reviews)).toBe(4);
    expect(getAverageRating([])).toBe(0);
  });

  it('should return co-benefit icons', () => {
    expect(getCoBenefitIcon('biodiversity')).toBeTruthy();
    expect(getCoBenefitIcon('community')).toBeTruthy();
    expect(getCoBenefitIcon('water')).toBeTruthy();
  });
});