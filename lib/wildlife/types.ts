/**
 * Wildlife sighting types — Issue #1665
 *
 * Sighting log submittable by field teams and approved citizen scientists,
 * feeding a per-project habitat quality score derived from sighting diversity.
 */

/** Who submitted the sighting. */
export type SubmitterRole = 'field_team' | 'citizen_scientist';

/** Review state of a sighting in the log. */
export type SightingStatus = 'pending' | 'approved' | 'rejected';

export type TaxonomicGroup = 'mammal' | 'bird' | 'reptile' | 'amphibian' | 'insect' | 'other';

export const TAXONOMIC_GROUPS: TaxonomicGroup[] = [
  'mammal',
  'bird',
  'reptile',
  'amphibian',
  'insect',
  'other',
];

export const SUBMITTER_ROLES: SubmitterRole[] = ['field_team', 'citizen_scientist'];

/** A single record in the wildlife sighting log. */
export interface WildlifeSighting {
  id: string;
  projectId: string;
  speciesCommonName: string;
  scientificName?: string;
  taxonomicGroup: TaxonomicGroup;
  /** Number of individuals observed in this sighting. */
  count: number;
  /** When the animals were observed, ISO-8601. */
  observedAt: string;
  /** Display name of the observer. */
  submittedBy: string;
  submitterRole: SubmitterRole;
  status: SightingStatus;
  reviewedBy?: string;
  reviewedAt?: string;
  /** Optional evidence photo URL shown on the project page when approved. */
  photoUrl?: string;
  notes?: string;
  /** When the record was created, ISO-8601. */
  createdAt: string;
}

export interface SubmitSightingInput {
  projectId: string;
  speciesCommonName: string;
  scientificName?: string;
  taxonomicGroup: TaxonomicGroup;
  count: number;
  observedAt: string;
  submittedBy: string;
  submitterRole: SubmitterRole;
  photoUrl?: string;
  notes?: string;
}

/** Habitat quality derived from the diversity of approved sightings. */
export interface HabitatQualityScore {
  projectId: string;
  /** 0–100 composite score (see HABITAT_SCORE_METHOD). */
  score: number;
  /** Plain-language band for the score. */
  interpretation: string;
  /** Distinct approved species. */
  speciesRichness: number;
  /** Distinct approved taxonomic groups. */
  taxonomicGroupCount: number;
  /** Shannon diversity index over approved sighting counts. */
  shannonIndex: number;
  /** Pielou evenness (H′ / ln S). */
  evenness: number;
  approvedSightings: number;
  totalSightings: number;
  computedAt: string;
}

/** Everything the project page needs to render the wildlife section. */
export interface WildlifeHabitatSnapshot {
  score: HabitatQualityScore;
  /** Most recent approved sightings (including ones without photos). */
  recentApproved: WildlifeSighting[];
  /** Latest approved sightings that carry a photo — featured on the page. */
  featuredPhotos: WildlifeSighting[];
}
