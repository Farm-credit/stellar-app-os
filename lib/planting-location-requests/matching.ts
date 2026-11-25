import type { PlantingLocation } from '@/lib/db/schema';
import { PREFERRED_PLANTING_REGIONS } from './schemas';
import type { LocationMatchSuggestion } from './types';

function normalize(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

/**
 * Resolves a country or free-text preference to its parent region group when known
 * (e.g. "Nigeria" -> "Sub-Saharan Africa", "Brazil" -> "Latin America").
 */
export function resolveRegionGroup(preference: string): string | null {
  const normalized = normalize(preference);
  if (!normalized) return null;

  for (const option of PREFERRED_PLANTING_REGIONS) {
    if (normalize(option.value) === normalized || normalize(option.regionGroup) === normalized) {
      return option.regionGroup;
    }
    if (option.countries.some((country) => normalize(country) === normalized)) {
      return option.regionGroup;
    }
  }

  for (const option of PREFERRED_PLANTING_REGIONS) {
    if (
      normalized.includes(normalize(option.regionGroup)) ||
      option.countries.some((country) => normalized.includes(normalize(country)))
    ) {
      return option.regionGroup;
    }
  }

  return null;
}

/**
 * Ranks available planting zones against a sponsor's preferred geographic region or country.
 * Exact region/country matches with sufficient capacity appear first, followed by
 * viable alternative zones ordered by available capacity.
 */
export function suggestMatchingZones(
  preferredRegion: string,
  preferredCountry: string | null | undefined,
  treeCount: number,
  zones: PlantingLocation[]
): LocationMatchSuggestion[] {
  const prefRegionNorm = normalize(preferredRegion);
  const prefCountryNorm = normalize(preferredCountry);
  const resolvedGroupFromRegion = resolveRegionGroup(preferredRegion);
  const resolvedGroupFromCountry = preferredCountry ? resolveRegionGroup(preferredCountry) : null;
  const resolvedGroup = normalize(resolvedGroupFromCountry ?? resolvedGroupFromRegion);

  return zones
    .map((location): LocationMatchSuggestion => {
      const zoneRegionNorm = normalize(location.region);
      const zoneNameNorm = normalize(location.name);
      const zoneDescNorm = normalize(location.description);
      const hasSufficientCapacity = location.availableCapacity >= treeCount;

      const directRegionMatch =
        Boolean(prefRegionNorm) &&
        (zoneRegionNorm === prefRegionNorm ||
          zoneRegionNorm.includes(prefRegionNorm) ||
          prefRegionNorm.includes(zoneRegionNorm));

      const countryMentionMatch =
        (Boolean(prefCountryNorm) &&
          (zoneNameNorm.includes(prefCountryNorm) || zoneDescNorm.includes(prefCountryNorm))) ||
        (Boolean(prefRegionNorm) &&
          (zoneNameNorm.includes(prefRegionNorm) || zoneDescNorm.includes(prefRegionNorm)));

      const mappedGroupMatch = Boolean(resolvedGroup) && zoneRegionNorm === resolvedGroup;

      const isExactMatch = directRegionMatch || countryMentionMatch || mappedGroupMatch;

      let score = 0;
      let matchReason = 'Alternative planting zone with open capacity';

      if (countryMentionMatch) {
        score += 100;
        matchReason = `Matches preferred country/area (${preferredCountry || preferredRegion})`;
      } else if (directRegionMatch) {
        score += 90;
        matchReason = `Matches preferred region (${location.region})`;
      } else if (mappedGroupMatch) {
        score += 80;
        matchReason = `Matches region group (${location.region}) for ${preferredCountry || preferredRegion}`;
      }

      if (hasSufficientCapacity) {
        score += 20;
      } else {
        score -= 50;
        matchReason = `${matchReason} — insufficient capacity (${location.availableCapacity} available, ${treeCount} requested)`;
      }

      // Tie-breaker based on capacity
      score += Math.min(10, Math.floor(location.availableCapacity / 5000));

      return {
        location,
        isExactMatch,
        hasSufficientCapacity,
        score,
        matchReason,
      };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.location.availableCapacity - a.location.availableCapacity;
    });
}
