import { describe, expect, it } from 'vitest';

import { HABITAT_SCORE_METHOD, computeHabitatQualityScore } from '../habitat';
import type { WildlifeSighting, TaxonomicGroup } from '../types';

function sighting(
  overrides: Partial<WildlifeSighting> & { speciesCommonName: string }
): WildlifeSighting {
  return {
    id: `id-${Math.random().toString(36).slice(2)}`,
    projectId: 'proj-hab',
    taxonomicGroup: 'bird' as TaxonomicGroup,
    count: 1,
    observedAt: '2026-05-01T00:00:00.000Z',
    submittedBy: 'Field Team',
    submitterRole: 'field_team',
    status: 'approved',
    createdAt: '2026-05-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('Habitat quality score (Issue #1665)', () => {
  const NOW = new Date('2026-10-23T00:00:00.000Z');

  it('returns zero with no approved sightings', () => {
    const score = computeHabitatQualityScore('proj-hab', [], NOW);
    expect(score.score).toBe(0);
    expect(score.interpretation).toBe('No approved sightings yet');
    expect(score.speciesRichness).toBe(0);
    expect(score.shannonIndex).toBe(0);
  });

  it('scores a diverse, balanced log highly', () => {
    const groups: TaxonomicGroup[] = ['mammal', 'bird', 'reptile', 'amphibian', 'insect'];
    const sightings = Array.from({ length: 12 }, (_, i) =>
      sighting({
        speciesCommonName: `Species ${i + 1}`,
        taxonomicGroup: groups[i % groups.length],
        count: 4,
      })
    );

    const score = computeHabitatQualityScore('proj-hab', sightings, NOW);
    expect(score.speciesRichness).toBe(12);
    expect(score.taxonomicGroupCount).toBe(5);
    expect(score.evenness).toBe(1);
    expect(score.score).toBeGreaterThanOrEqual(95);
    expect(score.interpretation).toBe('Excellent habitat quality');
  });

  it('scores a single-species sighting lower', () => {
    const score = computeHabitatQualityScore(
      'proj-hab',
      [sighting({ speciesCommonName: 'Monkey', taxonomicGroup: 'mammal' })],
      NOW
    );
    expect(score.speciesRichness).toBe(1);
    expect(score.taxonomicGroupCount).toBe(1);
    // 40% evenness + 3.5% richness + 5% groups ≈ 49
    expect(score.score).toBeGreaterThanOrEqual(45);
    expect(score.score).toBeLessThan(60);
    expect(score.interpretation).toBe('Moderate habitat quality');
  });

  it('ignores pending and rejected sightings in the score but counts them as total', () => {
    const sightings = [
      sighting({ speciesCommonName: 'Eagle', taxonomicGroup: 'bird' }),
      sighting({ speciesCommonName: 'Lion', taxonomicGroup: 'mammal', status: 'pending' }),
      sighting({ speciesCommonName: 'Cobra', taxonomicGroup: 'reptile', status: 'rejected' }),
    ];

    const score = computeHabitatQualityScore('proj-hab', sightings, NOW);
    expect(score.approvedSightings).toBe(1);
    expect(score.totalSightings).toBe(3);
    expect(score.speciesRichness).toBe(1);
    expect(score.taxonomicGroupCount).toBe(1);
  });

  it('aggregates repeated sightings of the same species', () => {
    const sightings = [
      sighting({ speciesCommonName: 'Eagle', count: 3 }),
      sighting({ speciesCommonName: 'eagle', count: 2 }),
    ];
    const score = computeHabitatQualityScore('proj-hab', sightings, NOW);
    expect(score.speciesRichness).toBe(1);
    expect(score.approvedSightings).toBe(2);
  });

  it('documents its formula', () => {
    expect(HABITAT_SCORE_METHOD).toMatch(/evenness/i);
    expect(HABITAT_SCORE_METHOD).toMatch(/richness/i);
    expect(HABITAT_SCORE_METHOD).toMatch(/approved/i);
  });
});
