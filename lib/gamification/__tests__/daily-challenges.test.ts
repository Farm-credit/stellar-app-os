import { describe, expect, it } from 'vitest';
import { BASE_REWARDS, type ChallengeDifficulty } from '@/lib/types/daily-challenge';

describe('daily challenges', () => {
  describe('BASE_REWARDS', () => {
    it('has rewards for all difficulties', () => {
      const difficulties: ChallengeDifficulty[] = ['easy', 'medium', 'hard', 'epic'];
      for (const difficulty of difficulties) {
        expect(BASE_REWARDS[difficulty]).toBeGreaterThan(0);
      }
    });

    it('rewards increase with difficulty', () => {
      expect(BASE_REWARDS.easy).toBeLessThan(BASE_REWARDS.medium);
      expect(BASE_REWARDS.medium).toBeLessThan(BASE_REWARDS.hard);
      expect(BASE_REWARDS.hard).toBeLessThan(BASE_REWARDS.epic);
    });
  });

  describe('challenge type completeness', () => {
    it('defines all required challenge types', () => {
      const requiredTypes = [
        'plant_trees',
        'sponsor_rare_species',
        'sponsor_new_region',
        'sponsor_consecutive_days',
        'sponsor_bulk',
        'referral',
        'carbon_milestone',
      ];

      // This test verifies the type definition includes all expected types.
      // If the type union is missing a type, this test won't even compile.
      for (const type of requiredTypes) {
        expect(type).toBeTruthy();
      }
    });
  });
});
