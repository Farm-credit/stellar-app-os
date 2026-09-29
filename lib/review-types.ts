export interface Review {
  id: string;
  planterId: string;
  sponsorId: string;
  rating: number;
  quality: number;
  responsiveness: number;
  treeHealth: number;
  comment?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewFormValues {
  rating: number;
  quality: number;
  responsiveness: number;
  treeHealth: number;
  comment: string;
}

export type ReviewCategory = 'quality' | 'responsiveness' | 'treeHealth';