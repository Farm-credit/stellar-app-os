import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/aws/rekognition', () => ({
  detectVisionLabelsFromBuffer: vi.fn(),
}));
vi.mock('@/lib/tree-health/repository', () => ({
  getActiveTreeHealthModel: vi.fn(),
}));

import { detectVisionLabelsFromBuffer } from '@/lib/aws/rekognition';
import { getActiveTreeHealthModel } from '@/lib/tree-health/repository';
import { analyzeTreeHealthImage } from '@/lib/tree-health/analyze';

const detectLabelsMock = vi.mocked(detectVisionLabelsFromBuffer);
const activeModelMock = vi.mocked(getActiveTreeHealthModel);

describe('analyzeTreeHealthImage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    activeModelMock.mockResolvedValue(null);
  });

  it('normalizes AWS Rekognition labels before scoring the image', async () => {
    detectLabelsMock.mockResolvedValue([
      { Name: 'Wilted Plant', Confidence: 92 },
      { Name: 'Dry Soil', Confidence: 86 },
    ]);

    const result = await analyzeTreeHealthImage(Buffer.from('field-photo'));

    expect(result.features).toEqual([
      { name: 'Wilted Plant', confidence: 92 },
      { name: 'Dry Soil', confidence: 86 },
    ]);
    expect(result.prediction.issues.map((issue) => issue.code)).toContain('drought_stress');
  });

  it('abstains when vision returns no labels even if a model is available', async () => {
    detectLabelsMock.mockResolvedValue([]);
    activeModelMock.mockResolvedValue({
      version: 'tree-health-2026-q4-test',
      trainedAt: '2026-10-01T00:00:00.000Z',
      sampleCount: 8,
      evaluatedCount: 2,
      accuracy: 0.5,
      vocabulary: ['Wilted Plant'],
      classes: {
        drought_stress: {
          prior: 0.5,
          present: { 'wilted plant': 0.8 },
          absent: { 'wilted plant': 0.2 },
        },
        pest_damage: { prior: 0.1, present: {}, absent: {} },
        disease: { prior: 0.1, present: {}, absent: {} },
      },
    });

    const result = await analyzeTreeHealthImage(Buffer.from('field-photo'));

    expect(result.features).toEqual([]);
    expect(result.prediction.issues).toEqual([]);
    expect(result.prediction.needsReview).toBe(true);
  });
});
