import type { PlanterReview, PlanterReviewSummary, ReviewCategory } from '@/lib/types/planter';

/**
 * Mock reviews from sponsors rating planting teams. Tied to the planter
 * profiles in `mockPlanterProfiles` by planterId.
 */
export const mockPlanterReviews: PlanterReview[] = [
  {
    id: 'review-001',
    planterId: 'planter-001',
    sponsorName: 'Elena Vasquez',
    sponsorAvatarUrl:
      'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&q=80&w=100',
    rating: 5,
    categoryRatings: { quality: 5, responsiveness: 5, treeHealth: 5 },
    comment:
      "Amina's nursery work is outstanding. Every seedling arrived healthy and well-labeled. Communication was prompt throughout the entire process.",
    treeSpecies: 'Drought-tolerant acacia',
    projectId: 'proj-001',
    createdAt: '2026-07-15',
  },
  {
    id: 'review-002',
    planterId: 'planter-001',
    sponsorName: 'James Okonkwo',
    rating: 4,
    categoryRatings: { quality: 4, responsiveness: 5, treeHealth: 4 },
    comment:
      "Great team to work with. The women's cooperative is impressive. Minor delays on the first batch, but nothing concerning.",
    treeSpecies: 'Moringa',
    projectId: 'proj-001',
    createdAt: '2026-06-20',
  },
  {
    id: 'review-003',
    planterId: 'planter-002',
    sponsorName: 'Maria Santos',
    sponsorAvatarUrl:
      'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&q=80&w=100',
    rating: 5,
    categoryRatings: { quality: 5, responsiveness: 4, treeHealth: 5 },
    comment:
      "Diego's approach to native species diversity is exactly what the Amazon needs. Survival rates exceeded my expectations.",
    treeSpecies: 'Mixed native hardwoods',
    projectId: 'proj-001',
    createdAt: '2026-08-01',
  },
  {
    id: 'review-004',
    planterId: 'planter-002',
    sponsorName: 'David Chen',
    rating: 4,
    categoryRatings: { quality: 4, responsiveness: 4, treeHealth: 5 },
    comment:
      'Excellent ecological planning. The family land-stewardship program shows real long-term thinking. Would sponsor again.',
    projectId: 'proj-002',
    createdAt: '2026-05-10',
  },
  {
    id: 'review-005',
    planterId: 'planter-003',
    sponsorName: 'Fatima Al-Rashid',
    sponsorAvatarUrl:
      'https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&q=80&w=100',
    rating: 5,
    categoryRatings: { quality: 5, responsiveness: 5, treeHealth: 5 },
    comment:
      "Grace's mangrove planting along the Ghanaian coast is transformative. The fishers-to-planters program is a brilliant community model.",
    treeSpecies: 'Red mangrove',
    projectId: 'proj-001',
    createdAt: '2026-08-10',
  },
  {
    id: 'review-006',
    planterId: 'planter-003',
    sponsorName: 'Robert Mensah',
    rating: 4,
    categoryRatings: { quality: 5, responsiveness: 3, treeHealth: 4 },
    comment:
      'High-quality planting work. Took a bit longer to get responses during the busy season, but the results speak for themselves.',
    treeSpecies: 'Coastal mangrove belt',
    createdAt: '2026-04-25',
  },
  {
    id: 'review-007',
    planterId: 'planter-004',
    sponsorName: 'Aisha Kamau',
    rating: 5,
    categoryRatings: { quality: 5, responsiveness: 5, treeHealth: 4 },
    comment:
      "Samuel's urban greening program is exactly what Nairobi needed. The neighbourhood committees ensure long-term care for every tree.",
    treeSpecies: 'Urban street trees',
    projectId: 'proj-002',
    createdAt: '2026-07-30',
  },
  {
    id: 'review-008',
    planterId: 'planter-001',
    sponsorName: 'Patrick Obi',
    rating: 5,
    categoryRatings: { quality: 5, responsiveness: 4, treeHealth: 5 },
    comment:
      'Consistently excellent work. The nursery produces healthy, vigorous seedlings. Would love to see the cooperative expand.',
    treeSpecies: 'Sahel indigenous mix',
    projectId: 'proj-001',
    createdAt: '2026-08-15',
  },
];

// ── Helper functions ─────────────────────────────────────────────────────

/** Compute the aggregated review summary for a given planter. */
export function getPlanterReviewSummary(planterId: string): PlanterReviewSummary {
  const reviews = mockPlanterReviews.filter((r) => r.planterId === planterId);

  if (reviews.length === 0) {
    return {
      averageRating: 0,
      totalReviews: 0,
      categoryAverages: { quality: 0, responsiveness: 0, treeHealth: 0 },
      ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    };
  }

  const totalRating = reviews.reduce((sum, r) => sum + r.rating, 0);
  const categoryTotals: Record<ReviewCategory, number> = {
    quality: 0,
    responsiveness: 0,
    treeHealth: 0,
  };
  const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

  for (const review of reviews) {
    categoryTotals.quality += review.categoryRatings.quality;
    categoryTotals.responsiveness += review.categoryRatings.responsiveness;
    categoryTotals.treeHealth += review.categoryRatings.treeHealth;
    distribution[review.rating] = (distribution[review.rating] ?? 0) + 1;
  }

  return {
    averageRating: Math.round((totalRating / reviews.length) * 10) / 10,
    totalReviews: reviews.length,
    categoryAverages: {
      quality: Math.round((categoryTotals.quality / reviews.length) * 10) / 10,
      responsiveness: Math.round((categoryTotals.responsiveness / reviews.length) * 10) / 10,
      treeHealth: Math.round((categoryTotals.treeHealth / reviews.length) * 10) / 10,
    },
    ratingDistribution: distribution,
  };
}

/** Get all reviews for a specific planter, newest first. */
export function getPlanterReviews(planterId: string): PlanterReview[] {
  return mockPlanterReviews
    .filter((r) => r.planterId === planterId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/** Client-side helper to add a new review (stores in localStorage for demo). */
export function addPlanterReview(review: Omit<PlanterReview, 'id' | 'createdAt'>): PlanterReview {
  const newReview: PlanterReview = {
    ...review,
    id: `review-${Date.now()}`,
    createdAt: new Date().toISOString().split('T')[0],
  };
  mockPlanterReviews.push(newReview);
  return newReview;
}
