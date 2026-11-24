import { describe, it, expect } from 'vitest';
import { mockCarbonProjects } from '@/lib/api/mock/carbonProjects';
import {
  getProjectClimateComparison,
  getAllProjectsClimateComparisons,
  assessPlantingConditions,
  METEOROLOGICAL_API_SOURCE,
} from '../climateComparisonService';

describe('climateComparisonService', () => {
  it('returns valid climate comparison for known project with open meteorological API attribution', () => {
    const project = mockCarbonProjects[0]; // Amazon Rainforest
    const comparison = getProjectClimateComparison(project, 2026);

    expect(comparison.projectId).toBe(project.id);
    expect(comparison.source).toContain('Open-Meteo & NASA POWER');
    expect(comparison.historicalYearRange).toContain('1991–2020');
    expect(comparison.currentYear).toBe(2026);

    // Historical & current rainfall/temperature
    expect(comparison.historical.annualRainfallMm).toBeGreaterThan(0);
    expect(comparison.current.annualRainfallMm).toBeGreaterThan(0);
    expect(comparison.historical.meanTemperatureC).toBeGreaterThan(0);
    expect(comparison.current.meanTemperatureC).toBeGreaterThan(0);

    // Delta calculations
    expect(comparison.comparison.rainfallDeltaMm).toBe(
      comparison.current.annualRainfallMm - comparison.historical.annualRainfallMm
    );
    expect(typeof comparison.comparison.rainfallDeltaPercent).toBe('number');
    expect(typeof comparison.comparison.temperatureDeltaC).toBe('number');

    // Planting conditions tailored for ecologists & sponsors
    expect(['Optimal', 'Favorable', 'Moderate Risk', 'Challenging']).toContain(
      comparison.plantingConditions.overallCondition
    );
    expect(comparison.plantingConditions.suitabilityScore).toBeGreaterThanOrEqual(0);
    expect(comparison.plantingConditions.suitabilityScore).toBeLessThanOrEqual(100);
    expect(comparison.plantingConditions.ecologicalSummary).toContain('Field Ecologist Assessment');
    expect(comparison.plantingConditions.sponsorSummary).toContain('Sponsor Advisory');
    expect(comparison.plantingConditions.recommendedPlantingWindow).toBeTruthy();
  });

  it('estimates climate comparison for unknown project coordinates gracefully', () => {
    const customProject = {
      ...mockCarbonProjects[0],
      id: 'custom-proj-999',
      coordinates: { latitude: 12.5, longitude: -1.5 },
    };

    const comparison = getProjectClimateComparison(customProject, 2026);
    expect(comparison.projectId).toBe('custom-proj-999');
    expect(comparison.historical.annualRainfallMm).toBeGreaterThan(0);
    expect(comparison.current.annualRainfallMm).toBeGreaterThan(0);
    expect(comparison.plantingConditions.suitabilityScore).toBeGreaterThan(0);
  });

  it('correctly assesses planting conditions under rainfall deficit (drought)', () => {
    const assessment = assessPlantingConditions(
      { annualRainfallMm: 1500, meanTemperatureC: 22 },
      { annualRainfallMm: 800, meanTemperatureC: 24.5 },
      'Reforestation'
    );

    expect(assessment.moistureStatus).toBe('severe_drought');
    expect(assessment.suitabilityScore).toBeLessThan(70);
    expect(assessment.overallCondition).toMatch(/Moderate Risk|Challenging/);
    expect(assessment.moistureDescription).toContain('deficit');
  });

  it('correctly assesses planting conditions under optimal rainfall and temperature', () => {
    const assessment = assessPlantingConditions(
      { annualRainfallMm: 1200, meanTemperatureC: 21 },
      { annualRainfallMm: 1250, meanTemperatureC: 21.4 },
      'Reforestation'
    );

    expect(assessment.moistureStatus).toBe('optimal');
    expect(assessment.thermalStatus).toBe('optimal');
    expect(assessment.suitabilityScore).toBeGreaterThanOrEqual(85);
    expect(assessment.overallCondition).toBe('Optimal');
  });

  it('returns comparison for all projects in catalog', () => {
    const all = getAllProjectsClimateComparisons(mockCarbonProjects);
    expect(all).toHaveLength(mockCarbonProjects.length);
    all.forEach((item) => {
      expect(item.source).toBe(METEOROLOGICAL_API_SOURCE);
      expect(item.comparison).toBeDefined();
    });
  });
});
