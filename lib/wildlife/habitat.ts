/**
 * Habitat quality score — Issue #1665
 *
 * "Habitat quality score derived from sighting diversity." The score combines
 * three normalised signals from the approved sighting log:
 *
 *   1. Pielou evenness of species abundances (Shannon H′ / ln S) — weight 0.40
 *   2. Species richness (S / 10 species, capped)               — weight 0.35
 *   3. Taxonomic group coverage (groups / 5, capped)           — weight 0.25
 *
 * A single-species log is treated as perfectly even (evenness is undefined
 * for S = 1) so it still scores on richness and group coverage.
 */

import { calculateShannonIndex, type SpeciesCount } from '@/lib/biodiversity/shannon-index';
import type { HabitatQualityScore, WildlifeSighting } from './types';

export const HABITAT_SCORE_METHOD =
  'Habitat quality score (0–100) = 40% · evenness (Shannon H′/ln S) + 35% · species richness (species/10, capped) + 25% · taxonomic group coverage (groups/5, capped), computed from approved wildlife sightings only. ' +
  'Field-team sightings are approved automatically; citizen-scientist sightings are included once a reviewer approves them. Score bands: 80+ excellent, 60–79 good, 40–59 moderate, 20–39 poor, below 20 critical.';

/** Species needed for full richness credit. */
const RICHNESS_TARGET = 10;
/** Taxonomic groups needed for full coverage credit. */
const GROUP_TARGET = 5;

const WEIGHT_EVENNESS = 0.4;
const WEIGHT_RICHNESS = 0.35;
const WEIGHT_GROUPS = 0.25;

function bandFor(score: number): string {
  if (score >= 80) return 'Excellent habitat quality';
  if (score >= 60) return 'Good habitat quality';
  if (score >= 40) return 'Moderate habitat quality';
  if (score >= 20) return 'Poor habitat quality';
  return 'Critical habitat quality';
}

/**
 * Compute the habitat quality score for a project from its approved
 * sightings. Pass every sighting (any status); only `approved` records are
 * counted, but `totalSightings` reports the size of the full log.
 */
export function computeHabitatQualityScore(
  projectId: string,
  sightings: WildlifeSighting[],
  now: Date = new Date()
): HabitatQualityScore {
  const approved = sightings.filter((sighting) => sighting.status === 'approved');

  const countsBySpecies = new Map<string, { displayName: string; count: number }>();
  const groups = new Set<string>();

  for (const sighting of approved) {
    const key = sighting.speciesCommonName.trim().toLowerCase();
    if (!key) continue;
    const entry = countsBySpecies.get(key) ?? {
      displayName: sighting.speciesCommonName.trim(),
      count: 0,
    };
    entry.count += sighting.count;
    countsBySpecies.set(key, entry);
    groups.add(sighting.taxonomicGroup);
  }

  const speciesData: SpeciesCount[] = [...countsBySpecies.entries()].map(([key, entry]) => ({
    speciesId: key,
    speciesName: entry.displayName,
    count: entry.count,
  }));

  const shannon = calculateShannonIndex(speciesData);

  const richness = shannon.speciesRichness;
  const evenness = richness > 1 ? shannon.evenness : richness === 1 ? 1 : 0;
  const richnessNorm = Math.min(richness / RICHNESS_TARGET, 1);
  const groupNorm = Math.min(groups.size / GROUP_TARGET, 1);

  const raw =
    WEIGHT_EVENNESS * evenness + WEIGHT_RICHNESS * richnessNorm + WEIGHT_GROUPS * groupNorm;
  const score = Math.round(raw * 100);

  return {
    projectId,
    score,
    interpretation: approved.length === 0 ? 'No approved sightings yet' : bandFor(score),
    speciesRichness: richness,
    taxonomicGroupCount: groups.size,
    shannonIndex: Math.round(shannon.shannonIndex * 100) / 100,
    evenness: Math.round(evenness * 100) / 100,
    approvedSightings: approved.length,
    totalSightings: sightings.length,
    computedAt: now.toISOString(),
  };
}
