/**
 * Type definitions for farmer ↔ buyer direct messaging and custom-deal
 * negotiation — Issue #1408.
 *
 * A conversation is a private, one-to-one thread between a farmer (seller)
 * and a buyer. The two parties can exchange free-text messages and structured
 * deal proposals that negotiate volume, timing and pricing outside the public
 * marketplace.
 */

/** Which side of the deal a participant sits on. */
export type ConversationParticipantRole = 'farmer' | 'buyer';

/**
 * Lifecycle of a conversation:
 *  - `open`        → created, no structured proposal yet
 *  - `negotiating` → at least one deal proposal is on the table
 *  - `agreed`      → the latest proposal was accepted
 *  - `declined`    → the latest proposal was rejected (a counter can revive it)
 *  - `closed`      → either party closed the thread; read-only
 */
export type ConversationStatus = 'open' | 'negotiating' | 'agreed' | 'declined' | 'closed';

/** What a single message represents in the negotiation. */
export type MessageKind = 'text' | 'offer' | 'counter_offer' | 'accept' | 'reject' | 'system';

/** Resolution state of a structured deal proposal. */
export type DealProposalStatus = 'pending' | 'accepted' | 'rejected' | 'superseded';

/** Action dispatched to the deal endpoint. */
export type DealAction = 'propose' | 'counter' | 'accept' | 'reject';

/**
 * Structured terms of a custom deal. Volume, timing and pricing are the three
 * axes the parties negotiate; `notes` carries free-text delivery/quality
 * conditions that do not fit the structured fields.
 */
export interface DealTerms {
  /** Volume being negotiated, in tonnes. */
  quantityTons: number;
  /** Price per tonne, denominated in `currency`. */
  pricePerTon: number;
  /** ISO-8601 timestamp for the start of the delivery window. */
  deliveryStart: string;
  /** ISO-8601 timestamp for the end of the delivery window. */
  deliveryEnd: string;
  /** Pricing currency; defaults to XLM. */
  currency: string;
  /** Optional delivery/quality conditions. */
  notes?: string;
}

/**
 * Caller-supplied deal terms. `currency` is optional and defaults to
 * {@link DEFAULT_MESSAGE_CURRENCY}; the service validates and normalises the
 * remaining fields into a {@link DealTerms}.
 */
export interface DealTermsInput {
  quantityTons: number;
  pricePerTon: number;
  deliveryStart: string;
  deliveryEnd: string;
  currency?: string;
  notes?: string;
}

/** One of the two parties in a conversation. */
export interface ConversationParticipant {
  userId: string;
  role: ConversationParticipantRole;
  displayName: string;
  walletAddress?: string;
}

/** A single message in a conversation thread. */
export interface NegotiationMessage {
  id: string;
  conversationId: string;
  senderId: string;
  senderRole: ConversationParticipantRole;
  kind: MessageKind;
  body: string;
  /** Structured terms attached to `offer` / `counter_offer` messages. */
  terms: DealTerms | null;
  createdAt: string;
  /** User ids that have read this message. */
  readBy: string[];
}

/** A structured offer/counter-offer on the table. */
export interface DealProposal {
  id: string;
  conversationId: string;
  proposedBy: string;
  proposedByRole: ConversationParticipantRole;
  terms: DealTerms;
  status: DealProposalStatus;
  createdAt: string;
  respondedAt: string | null;
  respondedBy: string | null;
}

/** A full conversation thread, including messages and proposals. */
export interface Conversation {
  id: string;
  subject: string;
  farmerId: string;
  buyerId: string;
  participants: ConversationParticipant[];
  status: ConversationStatus;
  projectId: string | null;
  listingId: string | null;
  messages: NegotiationMessage[];
  proposals: DealProposal[];
  /** Latest proposed terms (pending or agreed); null before the first offer. */
  currentTerms: DealTerms | null;
  /** Terms of the accepted proposal, once a deal is agreed. */
  agreedTerms: DealTerms | null;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
}

/** Lightweight conversation shape returned by the list endpoint. */
export interface ConversationSummary {
  id: string;
  subject: string;
  farmerId: string;
  buyerId: string;
  participants: ConversationParticipant[];
  status: ConversationStatus;
  projectId: string | null;
  listingId: string | null;
  messageCount: number;
  /** Unread messages for the requesting user (0 when no `userId` is given). */
  unreadCount: number;
  lastMessage: {
    id: string;
    senderId: string;
    kind: MessageKind;
    body: string;
    createdAt: string;
  } | null;
  latestProposal: DealProposal | null;
  currentTerms: DealTerms | null;
  agreedTerms: DealTerms | null;
  createdAt: string;
  updatedAt: string;
}

/** Snapshot of the negotiation state for a conversation. */
export interface DealState {
  conversationId: string;
  status: ConversationStatus;
  proposals: DealProposal[];
  pendingProposal: DealProposal | null;
  currentTerms: DealTerms | null;
  agreedTerms: DealTerms | null;
}

// ── Input contracts ───────────────────────────────────────────────────────────

export interface CreateConversationInput {
  /** Farmer (seller) side of the thread. */
  farmerId: string;
  /** Buyer side of the thread. */
  buyerId: string;
  /** Must be `farmerId` or `buyerId`; determines the sender role. */
  initiatorId: string;
  subject?: string;
  farmerName?: string;
  buyerName?: string;
  farmerWalletAddress?: string;
  buyerWalletAddress?: string;
  /** Optional marketplace project this custom deal is based on. */
  projectId?: string;
  /** Optional marketplace listing this custom deal is based on. */
  listingId?: string;
  /** Optional opening free-text message. */
  initialMessage?: string;
  /** Optional opening structured offer. */
  terms?: DealTermsInput;
}

export interface SendMessageInput {
  senderId: string;
  body: string;
  /** When present the message records a structured offer/counter-offer. */
  terms?: DealTermsInput;
}

export interface ProposeDealInput {
  proposerId: string;
  terms: DealTermsInput;
  /** Optional note attached to the proposal message. */
  note?: string;
}

export interface DealActionInput {
  actorId: string;
  action: DealAction;
  /** Required for `propose` and `counter`. */
  terms?: DealTermsInput;
  /** Optional note attached to the resulting message. */
  note?: string;
  /** Target proposal; defaults to the latest pending proposal. */
  proposalId?: string;
}

export interface ListConversationsFilter {
  /** When set, only conversations this user participates in are returned. */
  userId?: string;
  /** Optionally narrow to conversations where `userId` holds this role. */
  role?: ConversationParticipantRole;
  status?: ConversationStatus;
  projectId?: string;
  /** Case-insensitive search over subject, participant names and messages. */
  search?: string;
  /** Only conversations with unread messages for `userId`. */
  unreadOnly?: boolean;
}

export interface ListMessagesOptions {
  /** Viewer must be a participant when provided. */
  viewerId?: string;
  /** Return only the most recent `limit` messages, oldest first. */
  limit?: number;
}
