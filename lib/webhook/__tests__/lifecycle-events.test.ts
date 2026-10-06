import { describe, expect, it } from 'vitest';
import { WEBHOOK_EVENT_TYPES } from '../types';

describe('tree lifecycle webhook contract', () => {
  it('supports all partner lifecycle events', () => {
    expect(WEBHOOK_EVENT_TYPES).toEqual(
      expect.arrayContaining(['tree.planted', 'tree.verified', 'tree.grown', 'tree.died'])
    );
  });
});
