export interface ReviewFormValues {
  rating: number;
  quality: number;
  responsiveness: number;
  treeHealth: number;
  comment: string;
}

export interface Review {
  id: string;
  planterId: string;
  sponsorId: string;
  rating: number;
  quality: number;
  responsiveness: number;
  treeHealth: number;
  comment: string;
  createdAt: string;
}

export interface ReviewSummary {
  totalReviews: number;
  averageRating: number;
  qualityAverage: number;
  responsivenessAverage: number;
  treeHealthAverage: number;
  ratingDistribution: {
    1: number;
    2: number;
    3: number;
    4: number;
    5: number;
  };
}
