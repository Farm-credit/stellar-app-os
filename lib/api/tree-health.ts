/**
 * Tree health observations and sponsor alerts — Issue #1698.
 *
 * The field team records a health score (0-100) per tree. When the score falls
 * by more than 20 points from the previous reading and the cause is pest damage
 * or drought stress, the tree's sponsor gets a push notification explaining the
 * cause and the remediation steps taken, linking to the tree profile and the
 * latest field team update.
 *
 * Storage is in-process (see `lib/api/field-messaging.ts`); swap the Maps for a
 * database without changing the routes.
 */
import { getTreeById } from '@/lib/api/tree-registry';
import { listSubscriptions, removeSubscription } from '@/lib/api/push-subscriptions';
import { getPushSender } from '@/lib/push/sender';
import {
  ALERTABLE_HEALTH_CAUSES,
  HEALTH_ALERT_DROP_THRESHOLD,
  HEALTH_CAUSE_LABELS,
  type PushDeliveryResult,
  type PushPayload,
  type TreeHealthAlert,
  type TreeHealthCause,
  type TreeHealthObservation,
} from '@/lib/types/tree-health';

export class TreeHealthError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = 'TreeHealthError';
    this.status = status;
  }
}

const observations = new Map<string, TreeHealthObservation[]>();
const alerts: TreeHealthAlert[] = [];
let counter = 0;

const CAUSES = Object.keys(HEALTH_CAUSE_LABELS) as TreeHealthCause[];

export function isAlertDrop(previous: number, next: number): boolean {
  return previous - next > HEALTH_ALERT_DROP_THRESHOLD;
}

export function treeProfileUrl(treeId: string): string {
  return `/trees/${encodeURIComponent(treeId)}`;
}

export function fieldUpdateUrl(treeId: string): string {
  return `${treeProfileUrl(treeId)}/timeline`;
}

export function buildAlertPayload(
  alert: Pick<
    TreeHealthAlert,
    'id' | 'treeId' | 'cause' | 'previousScore' | 'newScore' | 'remediation'
  >
): PushPayload {
  const cause = HEALTH_CAUSE_LABELS[alert.cause];
  const steps =
    alert.remediation.length > 0
      ? `Field team response: ${alert.remediation.join('; ')}.`
      : 'The field team is assessing the next steps.';
  const profileUrl = treeProfileUrl(alert.treeId);
  const updateUrl = fieldUpdateUrl(alert.treeId);
  return {
    title: 'Your tree needs attention',
    body: `Health fell from ${alert.previousScore} to ${alert.newScore} due to ${cause}. ${steps}`,
    url: updateUrl,
    tag: `tree-health-${alert.treeId}`,
    actions: [
      { action: 'view-tree', title: 'View tree', url: profileUrl },
      { action: 'view-update', title: 'Field update', url: updateUrl },
    ],
  };
}

function parseInput(input: {
  treeId?: unknown;
  score?: unknown;
  cause?: unknown;
  remediation?: unknown;
  note?: unknown;
  photoUrls?: unknown;
}) {
  const treeId = typeof input.treeId === 'string' ? input.treeId.trim() : '';
  if (!treeId) throw new TreeHealthError('Tree id is required');
  const score = input.score;
  if (typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > 100) {
    throw new TreeHealthError('Score must be a number between 0 and 100');
  }
  let cause: TreeHealthCause | null = null;
  if (input.cause !== undefined && input.cause !== null) {
    if (!CAUSES.includes(input.cause as TreeHealthCause)) {
      throw new TreeHealthError(`Cause must be one of: ${CAUSES.join(', ')}`);
    }
    cause = input.cause as TreeHealthCause;
  }
  let remediation: string[] = [];
  if (input.remediation !== undefined) {
    if (
      !Array.isArray(input.remediation) ||
      input.remediation.some((s) => typeof s !== 'string' || !s.trim())
    ) {
      throw new TreeHealthError('Remediation must be a list of non-empty strings');
    }
    remediation = (input.remediation as string[]).map((s) => s.trim());
  }
  let photoUrls: string[] = [];
  if (input.photoUrls !== undefined) {
    if (
      !Array.isArray(input.photoUrls) ||
      input.photoUrls.some((u) => typeof u !== 'string' || !/^https?:\/\//.test(u))
    ) {
      throw new TreeHealthError('photoUrls must be a list of http(s) URLs');
    }
    photoUrls = input.photoUrls as string[];
  }
  const note = typeof input.note === 'string' && input.note.trim() ? input.note.trim() : null;
  return { treeId, score, cause, remediation, note, photoUrls };
}

async function deliver(sponsorId: string, payload: PushPayload): Promise<PushDeliveryResult> {
  const sender = getPushSender();
  const result: PushDeliveryResult = {
    sent: 0,
    failed: 0,
    removed: 0,
    skipped: !sender.configured,
  };
  if (!sender.configured) return result;
  for (const subscription of listSubscriptions(sponsorId)) {
    const outcome = await sender.send(subscription, payload);
    if (outcome === 'sent') result.sent += 1;
    else if (outcome === 'gone') {
      removeSubscription(sponsorId, subscription.endpoint);
      result.removed += 1;
    } else result.failed += 1;
  }
  return result;
}

export interface RecordResult {
  observation: TreeHealthObservation;
  alert: TreeHealthAlert | null;
}

export async function recordHealthObservation(
  input: Parameters<typeof parseInput>[0]
): Promise<RecordResult> {
  const data = parseInput(input);
  const tree = await getTreeById(data.treeId);
  if (!tree) throw new TreeHealthError('Tree not found', 404);

  const history = observations.get(data.treeId) ?? [];
  const previous = history[history.length - 1];
  const observation: TreeHealthObservation = {
    id: `obs-${++counter}`,
    ...data,
    recordedAt: new Date().toISOString(),
  };
  history.push(observation);
  observations.set(data.treeId, history);

  const shouldAlert =
    previous !== undefined &&
    isAlertDrop(previous.score, observation.score) &&
    observation.cause !== null &&
    ALERTABLE_HEALTH_CAUSES.includes(observation.cause);
  if (!shouldAlert || !observation.cause) return { observation, alert: null };

  const sponsorId = tree.nftOwner;
  const base = {
    id: `alert-${++counter}`,
    treeId: data.treeId,
    cause: observation.cause,
    previousScore: previous.score,
    newScore: observation.score,
    remediation: observation.remediation,
  };
  const payload = buildAlertPayload(base);
  const alert: TreeHealthAlert = {
    ...base,
    sponsorId: sponsorId ?? '',
    drop: previous.score - observation.score,
    title: payload.title,
    body: payload.body,
    profileUrl: treeProfileUrl(data.treeId),
    fieldUpdateUrl: fieldUpdateUrl(data.treeId),
    createdAt: observation.recordedAt,
    // Trees without a recorded sponsor have nobody to notify.
    delivery: sponsorId
      ? await deliver(sponsorId, payload)
      : { sent: 0, failed: 0, removed: 0, skipped: true },
  };
  alerts.push(alert);
  return { observation, alert };
}

export function listHealthAlerts(sponsorId: string): TreeHealthAlert[] {
  return alerts.filter((a) => a.sponsorId === sponsorId);
}

/** Every recorded observation, oldest first within each tree. */
export function listAllHealthObservations(): TreeHealthObservation[] {
  return [...observations.values()].flat();
}

export function resetTreeHealthForTest(): void {
  observations.clear();
  alerts.length = 0;
  counter = 0;
}
