import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api/tree-registry', () => ({
  getTreeById: vi.fn((id: string) =>
    Promise.resolve(id === 'HRV-2024-0001' ? { treeId: id, id } : null)
  ),
}));
const recordHealth = vi.hoisted(() => vi.fn(() => Promise.resolve({})));
vi.mock('@/lib/api/tree-health', () => ({ recordHealthObservation: recordHealth }));

import {
  FieldSubmissionError,
  getSubmissionPhoto,
  listSubmissionsForTree,
  recordSubmission,
  resetFieldSubmissionsForTest,
  type FieldSubmissionInput,
} from '../submissions';

function input(overrides: Partial<FieldSubmissionInput> = {}): FieldSubmissionInput {
  return {
    clientId: 'client-0001',
    treeId: 'HRV-2024-0001',
    latitude: 12.04,
    longitude: 8.48,
    accuracyMeters: 6,
    capturedAt: '2026-05-01T10:00:00Z',
    healthScore: null,
    note: null,
    photo: { bytes: new Uint8Array(60_000), contentType: 'image/jpeg' },
    ...overrides,
  };
}

describe('field submissions', () => {
  beforeEach(() => {
    resetFieldSubmissionsForTest();
    recordHealth.mockClear();
  });

  it('stores a submission and serves its photo', async () => {
    const { submission, duplicate } = await recordSubmission(input());
    expect(duplicate).toBe(false);
    expect(listSubmissionsForTree('HRV-2024-0001')).toHaveLength(1);
    expect(getSubmissionPhoto(submission.id)?.contentType).toBe('image/jpeg');
  });

  it('is idempotent on client id', async () => {
    await recordSubmission(input());
    const again = await recordSubmission(input());
    expect(again.duplicate).toBe(true);
    expect(listSubmissionsForTree('HRV-2024-0001')).toHaveLength(1);
  });

  it('forwards health scores to the alerting pipeline', async () => {
    await recordSubmission(input({ healthScore: 55, note: 'leaf curl' }));
    expect(recordHealth).toHaveBeenCalledWith({
      treeId: 'HRV-2024-0001',
      score: 55,
      note: 'leaf curl',
    });
  });

  it.each([
    ['unknown tree', { treeId: 'nope' }, 404],
    ['bad latitude', { latitude: 120 }, 400],
    ['bad longitude', { longitude: -200 }, 400],
    ['bad score', { healthScore: 101 }, 400],
    ['bad type', { photo: { bytes: new Uint8Array(60_000), contentType: 'text/html' } }, 415],
    ['tiny photo', { photo: { bytes: new Uint8Array(10), contentType: 'image/jpeg' } }, 422],
    ['bad client id', { clientId: 'x' }, 400],
  ])('rejects %s', async (_name, overrides, status) => {
    const error = await recordSubmission(input(overrides as Partial<FieldSubmissionInput>)).catch(
      (e: unknown) => e
    );
    expect(error).toBeInstanceOf(FieldSubmissionError);
    expect((error as FieldSubmissionError).status).toBe(status);
  });
});
