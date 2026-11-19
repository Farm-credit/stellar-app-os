/**
 * Farmer ↔ buyer direct messaging service — Issue #1408
 *
 * Implements private one-to-one messaging for custom deals outside the public
 * marketplace:
 *
 *  - opening a conversation between a farmer (seller) and a buyer
 *  - exchanging free-text messages in the thread
 *  - negotiating structured deal terms (volume, delivery timing, pricing)
 *  - proposing, countering, accepting and rejecting offers
 *  - per-user unread tracking and read receipts
 *
 * Persistence is an in-process Map so the feature works in dev and unit tests
 * without a database. Every public function below is storage agnostic — swap
 * the `store` for the Postgres layer in production without changing the routes
 * or the hooks. This mirrors the cooperative service
 * (`lib/api/cooperatives.ts`), which takes the same approach.
 */

import type {
  Conversation,
  ConversationParticipant,
  ConversationParticipantRole,
  ConversationStatus,
  ConversationSummary,
  CreateConversationInput,
  DealActionInput,
  DealProposal,
  DealState,
  DealTerms,
  DealTermsInput,
  ListConversationsFilter,
  ListMessagesOptions,
  MessageKind,
  NegotiationMessage,
  SendMessageInput,
} from '@/lib/types/messaging';

// ── Constants ─────────────────────────────────────────────────────────────────

export const DEFAULT_MESSAGE_CURRENCY = 'XLM';
export const MAX_MESSAGE_BODY_LENGTH = 4_000;
export const MAX_DEAL_NOTES_LENGTH = 500;
export const MAX_SUBJECT_LENGTH = 160;

/** Statuses in which a new or revised offer may be made. */
const OFFERABLE_STATUSES: readonly ConversationStatus[] = [
  'open',
  'negotiating',
  'declined',
];

// ── Errors ────────────────────────────────────────────────────────────────────

/** Domain error carrying the HTTP status the route layer should return. */
export class MessagingError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 400, code = 'invalid_request') {
    super(message);
    this.name = 'MessagingError';
    this.status = status;
    this.code = code;
  }
}

function invalid(message: string): MessagingError {
  return new MessagingError(message, 400, 'invalid_request');
}

function notFound(message: string): MessagingError {
  return new MessagingError(message, 404, 'not_found');
}

function conflict(message: string): MessagingError {
  return new MessagingError(message, 409, 'conflict');
}

function forbidden(message: string): MessagingError {
  return new MessagingError(message, 403, 'forbidden');
}

// ── Store (swap for a database in production) ─────────────────────────────────

const store: { conversations: Map<string, Conversation>; seq: number } = {
  conversations: new Map(),
  seq: 0,
};

/** Clears all messaging state. Used by tests; never call in production code. */
export function resetMessagingStore(): void {
  store.conversations.clear();
  store.seq = 0;
}

function nextId(prefix: string): string {
  store.seq += 1;
  return `${prefix}-${store.seq}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

// ── Term normalisation ────────────────────────────────────────────────────────

function parseDeliveryDate(value: string | undefined, field: string): string {
  const raw = (value ?? '').trim();
  if (!raw) throw invalid(`${field} is required`);
  const parsed = Date.parse(raw);
  if (Number.isNaN(parsed)) throw invalid(`${field} must be a valid ISO-8601 date`);
  return new Date(parsed).toISOString();
}

/**
 * Validates and normalises caller-supplied deal terms. Volume, pricing and the
 * delivery window are all required; currency defaults to XLM.
 */
export function normalizeDealTerms(input: DealTermsInput): DealTerms {
  if (!input || typeof input !== 'object') throw invalid('terms are required');

  const quantityTons = Number(input.quantityTons);
  if (!Number.isFinite(quantityTons) || quantityTons <= 0) {
    throw invalid('quantityTons must be greater than zero');
  }

  const pricePerTon = Number(input.pricePerTon);
  if (!Number.isFinite(pricePerTon) || pricePerTon <= 0) {
    throw invalid('pricePerTon must be greater than zero');
  }

  const deliveryStart = parseDeliveryDate(input.deliveryStart, 'deliveryStart');
  const deliveryEnd = parseDeliveryDate(input.deliveryEnd, 'deliveryEnd');
  if (Date.parse(deliveryStart) > Date.parse(deliveryEnd)) {
    throw invalid('deliveryStart must be on or before deliveryEnd');
  }

  const currency = ((input.currency ?? DEFAULT_MESSAGE_CURRENCY).trim() || DEFAULT_MESSAGE_CURRENCY)
    .toUpperCase();
  if (currency.length > 12) throw invalid('currency must be 12 characters or fewer');

  const notes = (input.notes ?? '').trim();
  if (notes.length > MAX_DEAL_NOTES_LENGTH) {
    throw invalid(`notes must be ${MAX_DEAL_NOTES_LENGTH} characters or fewer`);
  }

  return {
    quantityTons: round4(quantityTons),
    pricePerTon: round2(pricePerTon),
    deliveryStart,
    deliveryEnd,
    currency,
    ...(notes ? { notes } : {}),
  };
}

/** Human-readable one-line description of deal terms. */
export function describeDealTerms(terms: DealTerms): string {
  return (
    `${terms.quantityTons} t @ ${terms.pricePerTon} ${terms.currency}/t` +
    ` (delivery ${terms.deliveryStart} → ${terms.deliveryEnd})`
  );
}

// ── Internal accessors ────────────────────────────────────────────────────────

function requireConversation(conversationId: string): Conversation {
  const conversation = store.conversations.get(conversationId);
  if (!conversation) throw notFound(`Conversation ${conversationId} not found`);
  return conversation;
}

function participantRole(
  conversation: Conversation,
  userId: string
): ConversationParticipantRole | null {
  if (userId === conversation.farmerId) return 'farmer';
  if (userId === conversation.buyerId) return 'buyer';
  return null;
}

function requireParticipant(
  conversation: Conversation,
  userId: string
): ConversationParticipantRole {
  const role = participantRole(conversation, userId);
  if (!role) throw forbidden('Only conversation participants can access this thread');
  return role;
}

function requireActorId(value: string | undefined, field: string): string {
  const actorId = (value ?? '').trim();
  if (!actorId) throw invalid(`${field} is required`);
  return actorId;
}

function requireOfferableStatus(conversation: Conversation): void {
  if (conversation.status === 'closed') {
    throw conflict('This conversation is closed');
  }
  if (conversation.status === 'agreed') {
    throw conflict('This deal has already been agreed');
  }
  if (!OFFERABLE_STATUSES.includes(conversation.status)) {
    throw conflict(`Offers are not allowed while the conversation is ${conversation.status}`);
  }
}

function findPendingProposal(conversation: Conversation, proposalId?: string): DealProposal {
  const pending = conversation.proposals.filter((proposal) => proposal.status === 'pending');
  if (pending.length === 0) {
    throw conflict('There is no pending offer to respond to');
  }
  if (proposalId) {
    const match = conversation.proposals.find((proposal) => proposal.id === proposalId);
    if (!match) throw notFound(`Proposal ${proposalId} not found`);
    if (match.status !== 'pending') throw conflict(`Proposal ${proposalId} is no longer pending`);
    return match;
  }
  return pending[pending.length - 1];
}

function appendMessage(
  conversation: Conversation,
  input: {
    senderId: string;
    kind: MessageKind;
    body: string;
    terms?: DealTerms | null;
  }
): NegotiationMessage {
  const body = input.body ?? '';
  if (body.length > MAX_MESSAGE_BODY_LENGTH) {
    throw invalid(`Message body must be ${MAX_MESSAGE_BODY_LENGTH} characters or fewer`);
  }
  const message: NegotiationMessage = {
    id: nextId('msg'),
    conversationId: conversation.id,
    senderId: input.senderId,
    senderRole: requireParticipant(conversation, input.senderId),
    kind: input.kind,
    body,
    terms: input.terms ?? null,
    createdAt: nowIso(),
    readBy: [input.senderId],
  };
  conversation.messages.push(message);
  conversation.updatedAt = message.createdAt;
  return message;
}

/**
 * Records a structured proposal and the offer/counter-offer message that
 * carries it. Any still-pending proposal is superseded — only one offer is ever
 * on the table at a time.
 */
function recordProposal(
  conversation: Conversation,
  actorId: string,
  termsInput: DealTermsInput,
  note?: string
): NegotiationMessage {
  const terms = normalizeDealTerms(termsInput);
  const hadProposal = conversation.proposals.length > 0;

  for (const proposal of conversation.proposals) {
    if (proposal.status === 'pending') proposal.status = 'superseded';
  }

  const timestamp = nowIso();
  const proposal: DealProposal = {
    id: nextId('deal'),
    conversationId: conversation.id,
    proposedBy: actorId,
    proposedByRole: requireParticipant(conversation, actorId),
    terms,
    status: 'pending',
    createdAt: timestamp,
    respondedAt: null,
    respondedBy: null,
  };
  conversation.proposals.push(proposal);
  conversation.currentTerms = terms;
  conversation.status = 'negotiating';

  const body = (note ?? '').trim();
  return appendMessage(conversation, {
    senderId: actorId,
    kind: hadProposal ? 'counter_offer' : 'offer',
    body: body || describeDealTerms(terms),
    terms,
  });
}

function countUnread(conversation: Conversation, userId: string): number {
  return conversation.messages.filter(
    (message) => message.senderId !== userId && !message.readBy.includes(userId)
  ).length;
}

function matchesSearch(conversation: Conversation, search: string): boolean {
  const haystack = [
    conversation.subject,
    conversation.projectId ?? '',
    conversation.listingId ?? '',
    ...conversation.participants.map((participant) => participant.displayName),
    ...conversation.messages.map((message) => message.body),
  ]
    .join(' ')
    .toLowerCase();
  return haystack.includes(search);
}

// ── Conversation creation & listing ───────────────────────────────────────────

export function createConversation(input: CreateConversationInput): Conversation {
  const farmerId = (input.farmerId ?? '').trim();
  if (!farmerId) throw invalid('farmerId is required');

  const buyerId = (input.buyerId ?? '').trim();
  if (!buyerId) throw invalid('buyerId is required');
  if (farmerId === buyerId) throw invalid('farmerId and buyerId must be different users');

  const initiatorId = (input.initiatorId ?? '').trim();
  if (!initiatorId) throw invalid('initiatorId is required');
  if (initiatorId !== farmerId && initiatorId !== buyerId) {
    throw invalid('initiatorId must be the farmer or the buyer');
  }

  const projectId = input.projectId?.trim() || null;
  const listingId = input.listingId?.trim() || null;

  const subject = (input.subject ?? '').trim() || 'Custom deal negotiation';
  if (subject.length > MAX_SUBJECT_LENGTH) {
    throw invalid(`subject must be ${MAX_SUBJECT_LENGTH} characters or fewer`);
  }

  const initialMessage = (input.initialMessage ?? '').trim();
  if (initialMessage.length > MAX_MESSAGE_BODY_LENGTH) {
    throw invalid(`Message body must be ${MAX_MESSAGE_BODY_LENGTH} characters or fewer`);
  }

  // Validate terms up front so a bad payload cannot leave a half-built thread.
  if (input.terms) normalizeDealTerms(input.terms);

  const duplicate = [...store.conversations.values()].find(
    (conversation) =>
      conversation.farmerId === farmerId &&
      conversation.buyerId === buyerId &&
      conversation.projectId === projectId &&
      conversation.listingId === listingId &&
      conversation.status !== 'closed' &&
      conversation.status !== 'agreed'
  );
  if (duplicate) {
    throw conflict(`An open conversation with this counterpart already exists (${duplicate.id})`);
  }

  const timestamp = nowIso();
  const participants: ConversationParticipant[] = [
    {
      userId: farmerId,
      role: 'farmer',
      displayName: (input.farmerName ?? farmerId).trim() || farmerId,
      walletAddress: input.farmerWalletAddress?.trim() || undefined,
    },
    {
      userId: buyerId,
      role: 'buyer',
      displayName: (input.buyerName ?? buyerId).trim() || buyerId,
      walletAddress: input.buyerWalletAddress?.trim() || undefined,
    },
  ];

  const conversation: Conversation = {
    id: nextId('conv'),
    subject,
    farmerId,
    buyerId,
    participants,
    status: 'open',
    projectId,
    listingId,
    messages: [],
    proposals: [],
    currentTerms: null,
    agreedTerms: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    closedAt: null,
  };
  store.conversations.set(conversation.id, conversation);

  if (initialMessage) {
    appendMessage(conversation, { senderId: initiatorId, kind: 'text', body: initialMessage });
  }
  if (input.terms) {
    recordProposal(conversation, initiatorId, input.terms);
  }

  return clone(conversation);
}

export function getConversation(conversationId: string, viewerId?: string): Conversation {
  const conversation = requireConversation(conversationId);
  if (viewerId) requireParticipant(conversation, requireActorId(viewerId, 'viewerId'));
  return clone(conversation);
}

export function getConversationSummary(
  conversation: Conversation,
  userId?: string
): ConversationSummary {
  const lastMessage = conversation.messages[conversation.messages.length - 1] ?? null;
  const latestProposal = conversation.proposals[conversation.proposals.length - 1] ?? null;

  return {
    id: conversation.id,
    subject: conversation.subject,
    farmerId: conversation.farmerId,
    buyerId: conversation.buyerId,
    participants: clone(conversation.participants),
    status: conversation.status,
    projectId: conversation.projectId,
    listingId: conversation.listingId,
    messageCount: conversation.messages.length,
    unreadCount: userId ? countUnread(conversation, userId) : 0,
    lastMessage: lastMessage
      ? {
          id: lastMessage.id,
          senderId: lastMessage.senderId,
          kind: lastMessage.kind,
          body: lastMessage.body,
          createdAt: lastMessage.createdAt,
        }
      : null,
    latestProposal: clone(latestProposal),
    currentTerms: clone(conversation.currentTerms),
    agreedTerms: clone(conversation.agreedTerms),
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
  };
}

export function listConversations(filter: ListConversationsFilter = {}): ConversationSummary[] {
  const userId = filter.userId?.trim() || undefined;
  if (filter.unreadOnly && !userId) {
    throw invalid('userId is required when unreadOnly is set');
  }

  const projectId = filter.projectId?.trim() || undefined;
  const search = filter.search?.trim().toLowerCase();

  return [...store.conversations.values()]
    .filter((conversation) => {
      if (userId) {
        const role = participantRole(conversation, userId);
        if (!role) return false;
        if (filter.role && role !== filter.role) return false;
      }
      if (filter.status && conversation.status !== filter.status) return false;
      if (projectId && conversation.projectId !== projectId) return false;
      if (filter.unreadOnly && userId && countUnread(conversation, userId) === 0) return false;
      if (search && !matchesSearch(conversation, search)) return false;
      return true;
    })
    .map((conversation) => getConversationSummary(conversation, userId))
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

// ── Messages ──────────────────────────────────────────────────────────────────

export function listMessages(
  conversationId: string,
  options: ListMessagesOptions = {}
): NegotiationMessage[] {
  const conversation = requireConversation(conversationId);
  if (options.viewerId) {
    requireParticipant(conversation, requireActorId(options.viewerId, 'viewerId'));
  }

  const messages = clone(conversation.messages);
  if (options.limit === undefined) return messages;

  const limit = Number(options.limit);
  if (!Number.isInteger(limit) || limit <= 0) {
    throw invalid('limit must be a positive integer');
  }
  return limit >= messages.length ? messages : messages.slice(messages.length - limit);
}

export function sendMessage(
  conversationId: string,
  input: SendMessageInput
): NegotiationMessage {
  const conversation = requireConversation(conversationId);
  const senderId = requireActorId(input.senderId, 'senderId');
  requireParticipant(conversation, senderId);
  if (conversation.status === 'closed') throw conflict('This conversation is closed');

  const body = (input.body ?? '').trim();
  if (body.length > MAX_MESSAGE_BODY_LENGTH) {
    throw invalid(`Message body must be ${MAX_MESSAGE_BODY_LENGTH} characters or fewer`);
  }

  if (input.terms) {
    requireOfferableStatus(conversation);
    return clone(recordProposal(conversation, senderId, input.terms, body || undefined));
  }

  if (!body) throw invalid('Message body cannot be empty');
  return clone(appendMessage(conversation, { senderId, kind: 'text', body }));
}

// ── Deal negotiation ──────────────────────────────────────────────────────────

export function proposeDeal(
  conversationId: string,
  proposerId: string,
  terms: DealTermsInput,
  note?: string
): Conversation {
  const conversation = requireConversation(conversationId);
  const actorId = requireActorId(proposerId, 'proposerId');
  requireParticipant(conversation, actorId);
  requireOfferableStatus(conversation);

  recordProposal(conversation, actorId, terms, note);
  return clone(conversation);
}

/**
 * Sends a counter-offer. The actor must be the party who did not make the
 * currently pending offer.
 */
export function counterDeal(
  conversationId: string,
  actorId: string,
  terms: DealTermsInput,
  note?: string,
  proposalId?: string
): Conversation {
  const conversation = requireConversation(conversationId);
  const actor = requireActorId(actorId, 'actorId');
  requireParticipant(conversation, actor);
  requireOfferableStatus(conversation);

  const pending = findPendingProposal(conversation, proposalId);
  if (pending.proposedBy === actor) {
    throw forbidden('You cannot counter your own offer');
  }

  recordProposal(conversation, actor, terms, note);
  return clone(conversation);
}

export function acceptDeal(
  conversationId: string,
  actorId: string,
  proposalId?: string
): Conversation {
  const conversation = requireConversation(conversationId);
  const actor = requireActorId(actorId, 'actorId');
  requireParticipant(conversation, actor);
  if (conversation.status === 'closed') throw conflict('This conversation is closed');
  if (conversation.status === 'agreed') throw conflict('This deal has already been agreed');

  const pending = findPendingProposal(conversation, proposalId);
  if (pending.proposedBy === actor) throw forbidden('You cannot accept your own offer');

  pending.status = 'accepted';
  pending.respondedAt = nowIso();
  pending.respondedBy = actor;

  conversation.currentTerms = pending.terms;
  conversation.agreedTerms = pending.terms;
  conversation.status = 'agreed';

  appendMessage(conversation, {
    senderId: actor,
    kind: 'accept',
    body: `Deal accepted: ${describeDealTerms(pending.terms)}`,
    terms: pending.terms,
  });

  return clone(conversation);
}

export function rejectDeal(
  conversationId: string,
  actorId: string,
  proposalId?: string
): Conversation {
  const conversation = requireConversation(conversationId);
  const actor = requireActorId(actorId, 'actorId');
  requireParticipant(conversation, actor);
  if (conversation.status === 'closed') throw conflict('This conversation is closed');
  if (conversation.status === 'agreed') throw conflict('This deal has already been agreed');

  const pending = findPendingProposal(conversation, proposalId);
  if (pending.proposedBy === actor) throw forbidden('You cannot reject your own offer');

  pending.status = 'rejected';
  pending.respondedAt = nowIso();
  pending.respondedBy = actor;
  conversation.status = 'declined';

  appendMessage(conversation, {
    senderId: actor,
    kind: 'reject',
    body: `Offer declined: ${describeDealTerms(pending.terms)}`,
    terms: pending.terms,
  });

  return clone(conversation);
}

export function getDealState(conversationId: string, viewerId?: string): DealState {
  const conversation = requireConversation(conversationId);
  if (viewerId) {
    requireParticipant(conversation, requireActorId(viewerId, 'viewerId'));
  }

  const pending = conversation.proposals.filter((proposal) => proposal.status === 'pending');
  return {
    conversationId: conversation.id,
    status: conversation.status,
    proposals: clone(conversation.proposals),
    pendingProposal: clone(pending[pending.length - 1] ?? null),
    currentTerms: clone(conversation.currentTerms),
    agreedTerms: clone(conversation.agreedTerms),
  };
}

/** Action-dispatched entry point used by the deal route. */
export function handleDealAction(conversationId: string, input: DealActionInput): Conversation {
  switch (input.action) {
    case 'propose': {
      if (!input.terms) throw invalid('terms are required when action is "propose"');
      return proposeDeal(conversationId, input.actorId, input.terms, input.note);
    }
    case 'counter': {
      if (!input.terms) throw invalid('terms are required when action is "counter"');
      return counterDeal(
        conversationId,
        input.actorId,
        input.terms,
        input.note,
        input.proposalId
      );
    }
    case 'accept':
      return acceptDeal(conversationId, input.actorId, input.proposalId);
    case 'reject':
      return rejectDeal(conversationId, input.actorId, input.proposalId);
    default:
      throw invalid('action must be one of: propose, counter, accept, reject');
  }
}

// ── Read state & lifecycle ────────────────────────────────────────────────────

export function markConversationRead(conversationId: string, userId: string): Conversation {
  const conversation = requireConversation(conversationId);
  const actor = requireActorId(userId, 'userId');
  requireParticipant(conversation, actor);

  for (const message of conversation.messages) {
    if (!message.readBy.includes(actor)) message.readBy.push(actor);
  }
  return clone(conversation);
}

export function getUnreadCount(conversationId: string, userId: string): number {
  const conversation = requireConversation(conversationId);
  const actor = requireActorId(userId, 'userId');
  requireParticipant(conversation, actor);
  return countUnread(conversation, actor);
}

export function closeConversation(conversationId: string, actorId: string): Conversation {
  const conversation = requireConversation(conversationId);
  const actor = requireActorId(actorId, 'actorId');
  requireParticipant(conversation, actor);
  if (conversation.status === 'closed') throw conflict('Conversation is already closed');

  conversation.status = 'closed';
  conversation.closedAt = nowIso();
  appendMessage(conversation, {
    senderId: actor,
    kind: 'system',
    body: `Conversation closed by ${actor}`,
  });

  return clone(conversation);
}
