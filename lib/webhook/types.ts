/**
 * Backend types for the outward webhook dispatch system (migration 007).
 *
 * These describe the server-side dispatcher that signs and POSTs notifications
 * to planter backends. They are distinct from the admin-viewer presentation
 * types in `@/lib/types/webhook`, which model the read-only logs UI.
 */

/**
 * Logical events the platform can dispatch. Kept as a const tuple so the union
 * type and a runtime list stay in sync.
 */
export const WEBHOOK_EVENT_TYPES = [
  'milestone.payout.approved',
  'planter.tree.registered',
  'planter.tree.verified',
  'planter.tree.health.updated',
  'planter.milestone.claimed',
] as const;

export type DispatchEventType = (typeof WEBHOOK_EVENT_TYPES)[number];

/** Delivery state machine — mirrors the `webhook_delivery_status` SQL enum. */
export type DeliveryStatus = 'pending' | 'retrying' | 'success' | 'failed';

// ── DB row types (column names match migration 007 exactly) ───────────────────

export interface WebhookSubscriptionRow {
  id: number;
  planter_id: number;
  url: string;
  secret: string;
  event_types: string[];
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

export interface WebhookDeliveryRow {
  id: number;
  event_id: string; // UUID
  subscription_id: number;
  event_type: string;
  payload: Record<string, unknown>;
  status: DeliveryStatus;
  http_status: number | null;
  response_body: string | null;
  error_message: string | null;
  attempt_count: number;
  max_attempts: number;
  next_attempt_at: Date | null;
  delivered_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

// ── Event payloads ────────────────────────────────────────────────────────────

/**
 * Payload sent for `milestone.payout.approved` — emitted once a milestone
 * escrow release is confirmed on-chain.
 */
export interface MilestonePayoutApprovedPayload {
  loanId: string;
  farmerWalletAddress: string;
  releasedAmountUsdc: number;
  network: 'testnet' | 'mainnet';
  transactionHash: string;
  explorerUrl: string;
  approvedAt: string; // ISO 8601
}

/**
 * Payload sent for `planter.tree.registered` — emitted when a new tree is
 * registered and an on-chain mint event is detected.
 */
export interface PlanterTreeRegisteredPayload {
  planterWallet: string;
  treeId: number;
  species: string;
  region: string;
  transactionHash: string;
  explorerUrl: string;
  registeredAt: string; // ISO 8601
}

/**
 * Payload sent for `planter.tree.verified` — emitted when a verifier approves
 * or rejects a tree planting during field verification.
 */
export interface PlanterTreeVerifiedPayload {
  planterWallet: string;
  treeId: number;
  verifierWallet: string;
  approved: boolean;
  notesHash: string | null;
  transactionHash: string;
  explorerUrl: string;
  verifiedAt: string; // ISO 8601
}

/**
 * Payload sent for `planter.tree.health.updated` — emitted when a tree's
 * health/survival status changes via the state machine.
 */
export interface PlanterTreeHealthUpdatedPayload {
  planterWallet: string;
  treeId: number;
  verifierWallet: string;
  previousHealth: string | null;
  newHealth: string;
  transactionHash: string;
  explorerUrl: string;
  updatedAt: string; // ISO 8601
}

/**
 * Payload sent for `planter.milestone.claimed` — emitted when a sponsor
 * claims a carbon credit milestone for a tree.
 */
export interface PlanterMilestoneClaimedPayload {
  planterWallet: string;
  treeId: number;
  sponsorWallet: string;
  milestoneYears: number;
  co2CreditsKg: number;
  transactionHash: string;
  explorerUrl: string;
  claimedAt: string; // ISO 8601
}

/** Discriminated envelope POSTed to planter backends. */
export interface WebhookEnvelope<T = Record<string, unknown>> {
  id: string; // event_id (UUID) — stable across retries for dedup
  type: DispatchEventType;
  createdAt: string; // ISO 8601
  data: T;
}

// ── Dispatcher result types ───────────────────────────────────────────────────

/** Outcome of a single HTTP attempt against a subscription endpoint. */
export interface AttemptResult {
  ok: boolean;
  httpStatus: number | null;
  responseBody: string | null;
  error: string | null;
}
