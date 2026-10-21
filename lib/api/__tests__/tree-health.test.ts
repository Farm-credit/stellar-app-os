import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import {
  TreeHealthError,
  buildAlertPayload,
  isAlertDrop,
  listHealthAlerts,
  recordHealthObservation,
  resetTreeHealthForTest,
} from '../tree-health';
import { resetPushSubscriptionsForTest, saveSubscription } from '../push-subscriptions';
import { setPushSenderForTest, type PushSender } from '@/lib/push/sender';

vi.mock('@/lib/api/tree-registry', () => ({
  getTreeById: (id: string) =>
    Promise.resolve(
      id === 'tree-001'
        ? { id: 'tree-001', nftOwner: 'GSPONSOR' }
        : id === 'tree-002'
          ? { id: 'tree-002' }
          : null
    ),
}));

const sub = (n: number) => ({
  endpoint: `https://push.example/${n}`,
  keys: { p256dh: 'p', auth: 'a' },
});

function fakeSender(outcome: 'sent' | 'gone' | 'failed' = 'sent') {
  const send = vi.fn().mockResolvedValue(outcome);
  const sender: PushSender = { configured: true, send };
  setPushSenderForTest(sender);
  return send;
}

beforeEach(() => {
  resetTreeHealthForTest();
  resetPushSubscriptionsForTest();
  saveSubscription('GSPONSOR', sub(1));
});

afterEach(() => setPushSenderForTest(null));

describe('isAlertDrop', () => {
  it('requires strictly more than 20 points', () => {
    expect(isAlertDrop(90, 70)).toBe(false);
    expect(isAlertDrop(90, 69)).toBe(true);
    expect(isAlertDrop(50, 80)).toBe(false);
  });
});

describe('recordHealthObservation', () => {
  it('alerts the sponsor with cause, remediation and links on a >20 point drop', async () => {
    const send = fakeSender();
    await recordHealthObservation({ treeId: 'tree-001', score: 90 });
    const { alert } = await recordHealthObservation({
      treeId: 'tree-001',
      score: 60,
      cause: 'pest_damage',
      remediation: ['Applied neem spray', 'Removed infested branches'],
    });

    expect(alert).not.toBeNull();
    expect(alert?.drop).toBe(30);
    expect(alert?.delivery.sent).toBe(1);
    const payload = send.mock.calls[0][1];
    expect(payload.body).toContain('pest damage');
    expect(payload.body).toContain('Applied neem spray; Removed infested branches');
    expect(payload.body).toContain('90 to 60');
    expect(payload.url).toBe('/trees/tree-001/timeline');
    expect(payload.actions.map((a: { url: string }) => a.url)).toEqual([
      '/trees/tree-001',
      '/trees/tree-001/timeline',
    ]);
    expect(listHealthAlerts('GSPONSOR')).toHaveLength(1);
  });

  it('alerts for drought stress too', async () => {
    fakeSender();
    await recordHealthObservation({ treeId: 'tree-001', score: 85 });
    const { alert } = await recordHealthObservation({
      treeId: 'tree-001',
      score: 50,
      cause: 'drought_stress',
    });
    expect(alert?.cause).toBe('drought_stress');
    expect(alert?.body).toContain('assessing the next steps');
  });

  it('does not alert for a drop of exactly 20 points', async () => {
    const send = fakeSender();
    await recordHealthObservation({ treeId: 'tree-001', score: 90 });
    const { alert } = await recordHealthObservation({
      treeId: 'tree-001',
      score: 70,
      cause: 'pest_damage',
    });
    expect(alert).toBeNull();
    expect(send).not.toHaveBeenCalled();
  });

  it('does not alert on the first reading, a rise, or a non-alertable cause', async () => {
    const send = fakeSender();
    const first = await recordHealthObservation({
      treeId: 'tree-001',
      score: 30,
      cause: 'pest_damage',
    });
    expect(first.alert).toBeNull();
    await recordHealthObservation({ treeId: 'tree-001', score: 95 });
    const disease = await recordHealthObservation({
      treeId: 'tree-001',
      score: 40,
      cause: 'disease',
    });
    expect(disease.alert).toBeNull();
    const noCause = await recordHealthObservation({ treeId: 'tree-001', score: 5 });
    expect(noCause.alert).toBeNull();
    expect(send).not.toHaveBeenCalled();
  });

  it('compares against the latest reading only', async () => {
    fakeSender();
    await recordHealthObservation({ treeId: 'tree-001', score: 100 });
    await recordHealthObservation({ treeId: 'tree-001', score: 70, cause: 'other' });
    const { alert } = await recordHealthObservation({
      treeId: 'tree-001',
      score: 55,
      cause: 'pest_damage',
    });
    expect(alert).toBeNull();
  });

  it('removes subscriptions the push service reports as gone', async () => {
    fakeSender('gone');
    await recordHealthObservation({ treeId: 'tree-001', score: 90 });
    const { alert } = await recordHealthObservation({
      treeId: 'tree-001',
      score: 40,
      cause: 'pest_damage',
    });
    expect(alert?.delivery).toMatchObject({ sent: 0, removed: 1 });
    const send = fakeSender('sent');
    await recordHealthObservation({ treeId: 'tree-001', score: 90 });
    await recordHealthObservation({ treeId: 'tree-001', score: 40, cause: 'pest_damage' });
    expect(send).not.toHaveBeenCalled();
  });

  it('records the alert but skips delivery when push is not configured', async () => {
    setPushSenderForTest({ configured: false, send: vi.fn() });
    await recordHealthObservation({ treeId: 'tree-001', score: 90 });
    const { alert } = await recordHealthObservation({
      treeId: 'tree-001',
      score: 40,
      cause: 'pest_damage',
    });
    expect(alert?.delivery.skipped).toBe(true);
  });

  it('has no recipient for a tree without a sponsor', async () => {
    const send = fakeSender();
    await recordHealthObservation({ treeId: 'tree-002', score: 90 });
    const { alert } = await recordHealthObservation({
      treeId: 'tree-002',
      score: 40,
      cause: 'pest_damage',
    });
    expect(alert?.delivery.skipped).toBe(true);
    expect(send).not.toHaveBeenCalled();
  });

  it('validates input and unknown trees', async () => {
    await expect(recordHealthObservation({ treeId: 'tree-001', score: 120 })).rejects.toThrow(
      TreeHealthError
    );
    await expect(
      recordHealthObservation({ treeId: 'tree-001', score: 50, cause: 'x' })
    ).rejects.toThrow(/Cause/);
    await expect(
      recordHealthObservation({ treeId: 'tree-001', score: 50, remediation: [''] })
    ).rejects.toThrow(/Remediation/);
    await expect(recordHealthObservation({ treeId: 'nope', score: 50 })).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe('buildAlertPayload', () => {
  it('encodes the tree id in links', () => {
    const p = buildAlertPayload({
      id: 'a',
      treeId: 'a b',
      cause: 'pest_damage',
      previousScore: 80,
      newScore: 50,
      remediation: [],
    });
    expect(p.url).toBe('/trees/a%20b/timeline');
  });
});
