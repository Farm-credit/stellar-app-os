import type { PlantingLocation } from '@/lib/db/schema';

export type LocationRequestStatus = 'pending' | 'confirmed' | 'alternative_assigned';

export interface PlantingLocationRequest {
  id: string;
  sponsorId: string | null;
  sponsorName: string;
  sponsorEmail: string;
  transactionRef: string | null;
  treeCount: number;
  preferredRegion: string;
  preferredCountry: string | null;
  preferenceNotes: string | null;
  status: LocationRequestStatus;
  assignedLocationId: number | null;
  assignedZoneName: string | null;
  assignedRegion: string | null;
  adminNotes: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  notifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateLocationRequestInput {
  sponsorId?: string | null;
  sponsorName?: string;
  sponsorEmail: string;
  transactionRef?: string | null;
  treeCount: number;
  preferredRegion: string;
  preferredCountry?: string | null;
  preferenceNotes?: string | null;
}

export interface MatchLocationRequestInput {
  locationId: number;
  resolution: 'confirmed' | 'alternative_assigned';
  adminNotes?: string | null;
  reviewedBy?: string;
}

export interface LocationMatchSuggestion {
  location: PlantingLocation;
  isExactMatch: boolean;
  hasSufficientCapacity: boolean;
  score: number;
  matchReason: string;
}

export interface LocationRequestNotification {
  requestId: string;
  to: string;
  sponsorName: string;
  status: 'confirmed' | 'alternative_assigned';
  subject: string;
  text: string;
  html: string;
  preferredRegion: string;
  assignedZoneName: string;
  assignedRegion: string;
  emailSent: boolean;
  sentAt: string;
}
