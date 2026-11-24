import { describe, expect, it } from 'vitest';
import {
  LESSON_PLANS,
  calculateSchoolSponsorshipCost,
  getLessonPlan,
  getSchoolTreePrice,
  renderLessonPlanMarkdown,
} from './schoolProgramme';

describe('school programme', () => {
  it('prices school tiers below the standard price', () => {
    expect(getSchoolTreePrice('primary')).toBe(0.4);
    expect(getSchoolTreePrice('secondary')).toBe(0.5);
    expect(calculateSchoolSponsorshipCost('primary', 100)).toEqual({
      trees: 100,
      standard: 100,
      total: 40,
      savings: 60,
    });
  });

  it('links a downloadable lesson plan to each species', () => {
    expect(getLessonPlan('Mango')?.species).toBe('mango');
    expect(getLessonPlan('unknown')).toBeUndefined();
    for (const plan of LESSON_PLANS) {
      const md = renderLessonPlanMarkdown(plan);
      expect(md).toContain(`# ${plan.title}`);
      expect(md).toContain('## Curriculum links');
    }
  });
});
