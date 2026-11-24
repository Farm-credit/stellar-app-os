import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  generateAltText,
  generateAltTextResult,
  generateAltTextFromUrl,
  generateAltTextFromBuffer,
} from '@/lib/aws/rekognition';

describe('AWS Rekognition Alt-Text Service', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe('credential and bucket validation fallbacks', () => {
    it('returns fallback alt text when AWS credentials are not configured', async () => {
      delete process.env.AWS_ACCESS_KEY_ID;
      delete process.env.AWS_SECRET_ACCESS_KEY;
      delete process.env.AWS_S3_BUCKET;

      const alt = await generateAltText('tree-photos/oak-1.jpg');
      expect(alt).toBe('Tree photo');

      const result = await generateAltTextResult('tree-photos/oak-1.jpg');
      expect(result).toEqual({
        altText: 'Tree photo',
        confidence: 0,
        labels: [],
      });
    });

    it('returns fallback when AWS credentials exist but AWS_S3_BUCKET is unset', async () => {
      process.env.AWS_ACCESS_KEY_ID = 'test-access-key';
      process.env.AWS_SECRET_ACCESS_KEY = 'test-secret';
      process.env.AWS_REGION = 'us-east-1';
      delete process.env.AWS_S3_BUCKET;

      const alt = await generateAltText('tree-photos/oak-1.jpg');
      expect(alt).toBe('Tree photo');

      const result = await generateAltTextResult('tree-photos/oak-1.jpg');
      expect(result.altText).toBe('Tree photo');
      expect(result.confidence).toBe(0);
    });

    it('returns fallback for generateAltTextFromUrl without credentials', async () => {
      delete process.env.AWS_ACCESS_KEY_ID;
      delete process.env.AWS_SECRET_ACCESS_KEY;

      const alt = await generateAltTextFromUrl('https://example.com/tree.jpg');
      expect(alt).toBe('Tree photo');
    });

    it('returns fallback for generateAltTextFromBuffer without credentials', async () => {
      delete process.env.AWS_ACCESS_KEY_ID;
      delete process.env.AWS_SECRET_ACCESS_KEY;

      const buf = Buffer.from('fake-image-bytes');
      const alt = await generateAltTextFromBuffer(buf, 'image/jpeg');
      expect(alt).toBe('Tree photo');
    });
  });

  describe('label synthesis with mocked Rekognition client', () => {
    it('synthesises description with tree keyword, context labels, and confidence', async () => {
      process.env.AWS_ACCESS_KEY_ID = 'test-access-key';
      process.env.AWS_SECRET_ACCESS_KEY = 'test-secret';
      process.env.AWS_REGION = 'us-east-1';
      process.env.AWS_S3_BUCKET = 'farm-credit-trees';

      // Mock the SDK
      vi.doMock('@aws-sdk/client-rekognition', () => {
        return {
          RekognitionClient: class MockClient {
            send(command: any) {
              if (command.constructor.name === 'DetectLabelsCommand' || command.Image) {
                if (command.MaxLabels) {
                  return Promise.resolve({
                    Labels: [
                      { Name: 'Tree', Confidence: 98 },
                      { Name: 'Foliage', Confidence: 90 },
                      { Name: 'Outdoor', Confidence: 85 },
                    ],
                  });
                }
                return Promise.resolve({
                  TextDetections: [],
                });
              }
              return Promise.resolve({});
            }
          },
          DetectLabelsCommand: class DetectLabelsCommand {
            Image: any;
            MaxLabels?: number;
            constructor(public input: any) {
              this.Image = input.Image;
              this.MaxLabels = input.MaxLabels;
            }
          },
          DetectTextCommand: class DetectTextCommand {
            Image: any;
            constructor(public input: any) {
              this.Image = input.Image;
            }
          },
        };
      });

      const { generateAltTextResult: mockedResultFn } = await import('@/lib/aws/rekognition');
      const res = await mockedResultFn('tree-photos/sapling.jpg');

      expect(res.confidence).toBeGreaterThan(80);
      expect(res.labels).toContain('Tree');
      expect(res.labels).toContain('Foliage');
      expect(res.altText).toContain('tree visible in the photo');
      expect(res.altText).toContain('Confidence:');
    });

    it('includes detected line text when confidence is >= 80', async () => {
      process.env.AWS_ACCESS_KEY_ID = 'test-access-key';
      process.env.AWS_SECRET_ACCESS_KEY = 'test-secret';
      process.env.AWS_REGION = 'us-east-1';
      process.env.AWS_S3_BUCKET = 'farm-credit-trees';

      vi.doMock('@aws-sdk/client-rekognition', () => {
        return {
          RekognitionClient: class MockClient {
            send(command: any) {
              if (command.MaxLabels) {
                return Promise.resolve({
                  Labels: [{ Name: 'Sapling', Confidence: 95 }],
                });
              }
              return Promise.resolve({
                TextDetections: [{ DetectedText: 'Tag #429', Type: 'LINE', Confidence: 92 }],
              });
            }
          },
          DetectLabelsCommand: class DetectLabelsCommand {
            MaxLabels?: number;
            constructor(public input: any) {
              this.MaxLabels = input.MaxLabels;
            }
          },
          DetectTextCommand: class DetectTextCommand {
            constructor(public input: any) {}
          },
        };
      });

      const { generateAltTextResult: mockedResultFn } = await import('@/lib/aws/rekognition');
      const res = await mockedResultFn('tree-photos/tagged.jpg');

      expect(res.altText).toContain('Text visible: "Tag #429"');
    });

    it('returns generic fallback if Rekognition detects no strong labels', async () => {
      process.env.AWS_ACCESS_KEY_ID = 'test-access-key';
      process.env.AWS_SECRET_ACCESS_KEY = 'test-secret';
      process.env.AWS_REGION = 'us-east-1';
      process.env.AWS_S3_BUCKET = 'farm-credit-trees';

      vi.doMock('@aws-sdk/client-rekognition', () => {
        return {
          RekognitionClient: class MockClient {
            send(command: any) {
              if (command.MaxLabels) {
                return Promise.resolve({
                  Labels: [{ Name: 'Uncertain', Confidence: 40 }], // below 70 threshold
                });
              }
              return Promise.resolve({ TextDetections: [] });
            }
          },
          DetectLabelsCommand: class DetectLabelsCommand {
            MaxLabels?: number;
            constructor(public input: any) {
              this.MaxLabels = input.MaxLabels;
            }
          },
          DetectTextCommand: class DetectTextCommand {
            constructor(public input: any) {}
          },
        };
      });

      const { generateAltTextResult: mockedResultFn } = await import('@/lib/aws/rekognition');
      const res = await mockedResultFn('tree-photos/blurry.jpg');

      expect(res.altText).toBe('Tree photo');
      expect(res.confidence).toBe(0);
    });
  });
});
