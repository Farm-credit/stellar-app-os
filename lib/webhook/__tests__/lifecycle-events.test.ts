import { describe, expect, it, vi } from 'vitest';
import { WEBHOOK_EVENT_TYPES } from '../types';
import { emitTreeLifecycleForStatus } from '../events';

const { dispatchEvent } = vi.hoisted(() => ({ dispatchEvent: vi.fn().mockResolvedValue([]) }));

vi.mock('@/lib/db/client', () => ({ getPool: () => ({}) }));
vi.mock('../dispatch', () => ({ dispatchEvent }));

describe('tree lifecycle webhook contract', () => {
  it('supports all partner lifecycle events', () => {
    expect(WEBHOOK_EVENT_TYPES).toEqual(
      expect.arrayContaining(['tree.planted', 'tree.verified', 'tree.grown', 'tree.died'])
    );
  });

  it.each([
    ['planted', 'tree.planted'],
    ['verified', 'tree.verified'],
    ['completed', 'tree.grown'],
    ['failed', 'tree.died'],
  ])('maps %s status to %s', async (status, eventType) => {
    dispatchEvent.mockClear();

    await emitTreeLifecycleForStatus(status, { treeId: 'tree-1' });

    expect(dispatchEvent).toHaveBeenCalledWith({}, eventType, expect.any(Object));
  });

  it('does not emit an event for unrelated statuses', async () => {
    dispatchEvent.mockClear();

    await emitTreeLifecycleForStatus('funded', { treeId: 'tree-1' });

    expect(dispatchEvent).not.toHaveBeenCalled();
  });
});
