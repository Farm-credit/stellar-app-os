import { describe, expect, it } from 'vitest';
import { mockCarbonProjects } from '@/lib/api/mock/carbonProjects';
import { getMockProjectSoilHealthData } from '@/lib/api/mock/projectSoilHealth';

describe('project soil health sample data', () => {
  it('provides a labeled historical comparison for each catalog project', () => {
    for (const project of mockCarbonProjects) {
      const data = getMockProjectSoilHealthData(project.id);

      if (!data) throw new Error(`Missing soil health sample data for ${project.id}`);

      expect(data.isSampleData).toBe(true);
      expect(data.readings).toHaveLength(2);
      const [previous, current] = data.readings;
      if (!previous || !current) throw new Error(`Missing sample history for ${project.id}`);
      expect(previous.date < current.date).toBe(true);
      expect(current).toMatchObject({
        ph: expect.any(Number),
        nitrogenMgKg: expect.any(Number),
        moisturePercent: expect.any(Number),
        organicMatterPercent: expect.any(Number),
      });
    }
  });
});
