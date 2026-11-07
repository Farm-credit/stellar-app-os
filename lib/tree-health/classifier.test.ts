import { describe, expect, it } from 'vitest';
import {
  predictFromVisionLabels,
  predictWithModel,
  trainTreeHealthModel,
  type TreeHealthTrainingExample,
} from '@/lib/tree-health/classifier';

describe('tree-health classifier', () => {
  it('flags visible drought, pest, and disease indicators for field review', () => {
    const result = predictFromVisionLabels([
      { name: 'Wilted Plant', confidence: 88 },
      { name: 'Insect', confidence: 76 },
      { name: 'Leaf Spot', confidence: 90 },
    ]);
    expect(result.needsReview).toBe(true);
    expect(result.issues.map((issue) => issue.code)).toEqual([
      'pest_damage',
      'drought_stress',
      'disease',
    ]);
    expect(result.confidence).toBeGreaterThan(75);
  });

  it('does not assert a diagnosis when no vision labels are available', () => {
    const result = predictFromVisionLabels([]);
    expect(result.issues).toEqual([]);
    expect(result.needsReview).toBe(true);
    expect(result.provider).toBe('unavailable');
  });

  it('trains a versioned classifier from reviewed image features and reports holdout accuracy', () => {
    const examples: TreeHealthTrainingExample[] = Array.from({ length: 10 }, (_, index) => ({
      features: index % 2 === 0 ? ['Wilted Plant', 'Dry Soil'] : ['Healthy Plant', 'Green Leaves'],
      correctedIssues: index % 2 === 0 ? ['drought_stress'] : [],
    }));
    const model = trainTreeHealthModel(
      examples,
      'tree-health-2026-q4-test',
      '2026-10-01T00:00:00.000Z'
    );
    const stressed = predictWithModel(['Wilted Plant', 'Dry Soil'], model);
    const healthy = predictWithModel(['Healthy Plant', 'Green Leaves'], model);
    expect(model.version).toBe('tree-health-2026-q4-test');
    expect(model.sampleCount).toBe(10);
    expect(model.accuracy).not.toBeNull();
    expect(stressed.issues.map((issue) => issue.code)).toContain('drought_stress');
    expect(healthy.issues.map((issue) => issue.code)).not.toContain('drought_stress');
  });

  it('requires a meaningful correction sample before quarterly retraining', () => {
    expect(() =>
      trainTreeHealthModel(
        Array.from({ length: 7 }, () => ({ features: ['Tree'], correctedIssues: [] })),
        'too-small'
      )
    ).toThrow(/at least 8 reviewed photos/i);
  });
});
