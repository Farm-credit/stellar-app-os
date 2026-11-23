export type NotificationType =
  | 'account_alert'
  | 'payout'
  | 'verification'
  | 'info'
  | 'warning'
  | 'error'
  | 'success'
  | 'newsletter'
  | 'weekly_digest'
  | 'newsletter_campaign'
  | 'tree_planted'
  | 'tree_survival_1y'
  | 'tree_milestone_5y'
  | 'tree_growth_stage_transition'
  | 'achievement_unlocked';

/**
 * Curated section kinds available in the monthly forest health newsletter.
 * These are authored in the admin CMS and rendered in the sponsor newsletter.
 */
export type NewsletterSectionKind =
  | 'platform_news'
  | 'featured_story'
  | 'species_spotlight'
  | 'conservation_tip';

export interface NewsletterSection {
  id: string;
  kind: NewsletterSectionKind;
  title: string;
  /** Body copy for the section (plain text or markdown). */
  body: string;
  /** Optional image URL used as a hero/thumbnail for the section. */
  imageUrl?: string;
  /** Optional call-to-action label and link. */
  ctaLabel?: string;
  ctaUrl?: string;
  /** Display order within the newsletter. */
  order: number;
}

export interface Newsletter {
  id: string;
  /** Human-readable edition title, e.g. "March 2025 Forest Health". */
  title: string;
  /** Edition month in `YYYY-MM` format. */
  edition: string;
  /** Short intro/teaser shown at the top of the newsletter. */
  summary?: string;
  sections: NewsletterSection[];
  /** Whether the newsletter is published and eligible for delivery. */
  published: boolean;
  /** ISO timestamp of when the newsletter was created. */
  createdAt: string;
  /** ISO timestamp of when the newsletter was last updated. */
  updatedAt: string;
  /** ISO timestamp of when the newsletter was published, if published. */
  publishedAt?: string;
}

export type NotificationPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface NotificationAction {
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
}

export interface Notification {
  id: string;
  title: string;
  description?: string;
  type: NotificationType;
  priority: NotificationPriority;
  timestamp: Date | string;
  read: boolean;
  archived: boolean;
  action?: NotificationAction;
  metadata?: Record<string, unknown>;
}

export interface ToastNotification {
  id: string;
  title: string;
  description?: string;
  type: 'success' | 'error' | 'warning' | 'info' | 'contract';
  duration?: number;
  action?: NotificationAction;
}

export interface NotificationState {
  notifications: Notification[];
  toasts: ToastNotification[];
  unreadCount: number;
  isDrawerOpen: boolean;
  /** Whether the sponsor has opted in to the monthly forest health newsletter. */
  newsletterOptIn: boolean;
  /** Daily email digest preferences for the sponsor. */
  digestPreferences: DigestPreferences;
  /** Most recently generated digest summary, if any. */
  digestSummary: DigestSummary | null;
  /** Whether the farmer support chat panel is open. */
  isChatOpen: boolean;
  /** Active farmer support chat conversation, if any. */
  chatConversation: ChatConversation | null;
  /** Current availability of agricultural experts. */
  expertAvailability: ExpertAvailability;
}

export interface NotificationActions {
  addNotification: (
    notification: Omit<Notification, 'id' | 'timestamp' | 'read' | 'archived'>
  ) => string;
  addToast: (toast: Omit<ToastNotification, 'id'>) => string;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  archiveNotification: (id: string) => void;
  removeNotification: (id: string) => void;
  dismissToast: (id: string) => void;
  openDrawer: () => void;
  closeDrawer: () => void;
  toggleDrawer: () => void;
  clearAll: () => void;
  clearRead: () => void;
  /** Update and persist the sponsor's newsletter subscription preference. */
  setNewsletterOptIn: (optIn: boolean) => void;
  /** Toggle the sponsor's newsletter subscription preference. */
  toggleNewsletterOptIn: () => void;
  /** Update and persist the sponsor's daily digest preferences. */
  setDigestPreferences: (preferences: Partial<DigestPreferences>) => void;
  /** Store the latest generated digest summary. */
  setDigestSummary: (summary: DigestSummary | null) => void;
  /** Open the farmer support chat panel. */
  openChat: () => void;
  /** Close the farmer support chat panel. */
  closeChat: () => void;
  /** Toggle the farmer support chat panel. */
  toggleChat: () => void;
  /** Start a new farmer support chat conversation for the given topic. */
  startChatConversation: (topic: ChatTopic) => string;
  /** Append a message to the active chat conversation. */
  sendChatMessage: (
    message: Omit<ChatMessage, 'id' | 'timestamp'>
  ) => string;
  /** Update the current expert availability status. */
  setExpertAvailability: (availability: ExpertAvailability) => void;
}

export type NotificationContextValue = NotificationState & NotificationActions;

/**
 * Push-notification event types for real-time tree milestones and sponsor
 * achievements. These mirror the milestone definitions in
 * `lib/trees/milestones.ts`, which act as the event source.
 */
export type PushNotificationEventType =
  | 'tree_planted'
  | 'tree_survival_1y'
  | 'tree_milestone_5y'
  | 'tree_growth_stage_transition'
  | 'achievement_unlocked';

export interface TreeMilestonePushPayload {
  type: 'tree_planted' | 'tree_survival_1y' | 'tree_milestone_5y';
  treeId: string;
  sponsorId: string;
  species?: string;
  location?: string;
  /** ISO timestamp of when the milestone occurred. */
  occurredAt: string;
}

export interface AchievementPushPayload {
  type: 'achievement_unlocked';
  sponsorId: string;
  achievementId: string;
  achievementTitle: string;
  treeId?: string;
  species?: string;
  location?: string;
  /** ISO timestamp of when the achievement was unlocked. */
  occurredAt: string;
}

export type PushNotificationPayload =
  | TreeMilestonePushPayload
  | AchievementPushPayload;

export interface PushNotificationMessage {
  id: string;
  payload: PushNotificationPayload;
  title: string;
  body: string;
  /** Device tokens the message was dispatched to. */
  tokens: string[];
  createdAt: string;
}

export interface PushNotificationDispatcher {
  /** Register a device token to receive push notifications. */
  registerDeviceToken: (token: string) => void;
  /** Unregister a previously registered device token. */
  unregisterDeviceToken: (token: string) => void;
  /** Currently registered device tokens. */
  getDeviceTokens: () => string[];
  /**
   * Dispatch a push payload to all registered device tokens via the existing
   * notifications layer. Returns the dispatched message, or null when there
   * are no registered tokens.
   */
  dispatch: (payload: PushNotificationPayload) => PushNotificationMessage | null;
}

/**
 * Preferences for the daily email digest. Instead of sending an email for
 * every event, events are aggregated and a single digest is delivered at
 * 9 AM in the sponsor's timezone.
 */
export interface DigestPreferences {
  /** Whether the daily digest is enabled. */
  enabled: boolean;
  /** IANA timezone identifier used to schedule the 9 AM delivery. */
  timezone: string;
}

/** A single aggregated event entry within a digest summary. */
export interface DigestEntry {
  type: NotificationType;
  title: string;
  description?: string;
  /** ISO timestamp of when the underlying event occurred. */
  occurredAt: string;
}

/** Aggregated daily summary of events delivered to sponsors. */
export interface DigestSummary {
  /** ISO date (YYYY-MM-DD) the digest covers. */
  date: string;
  /** IANA timezone the digest was generated for. */
  timezone: string;
  entries: DigestEntry[];
  /** Total number of events aggregated into the digest. */
  totalEvents: number;
  /** ISO timestamp of when the digest was generated. */
  generatedAt: string;
}

/** Topics a farmer can ask agricultural experts about. */
export type ChatTopic =
  | 'carbon-farming'
  | 'soil-health'
  | 'certification'
  | 'market-prices';

export type ChatMessageAuthor = 'farmer' | 'expert' | 'system';

export interface ChatMessage {
  id: string;
  conversationId: string;
  author: ChatMessageAuthor;
  /** Display name of the message author. */
  authorName?: string;
  content: string;
  /** ISO timestamp of when the message was sent. */
  timestamp: string;
  read?: boolean;
}

export interface ChatConversation {
  id: string;
  topic: ChatTopic;
  messages: ChatMessage[];
  /** ISO timestamp of when the conversation was started. */
  createdAt: string;
  /** Whether an expert has joined the conversation. */
  expertJoined: boolean;
  /** Display name of the assigned expert, if any. */
  expertName?: string;
}

export type ExpertAvailabilityStatus =
  | 'online'
  | 'busy'
  | 'offline'
  | 'away';

export interface ExpertAvailability {
  status: ExpertAvailabilityStatus;
  /** Number of experts currently available to chat. */
  availableExperts: number;
  /** Estimated wait time in minutes before an expert responds. */
  estimatedWaitMinutes?: number;
  /** ISO timestamp of when the availability was last updated. */
  updatedAt: string;
}

/** Notification surfaced when an expert replies in the support chat. */
export interface ExpertChatNotification {
  type: 'expert_chat';
  conversationId: string;
  topic: ChatTopic;
  expertName: string;
  message: string;
  /** ISO timestamp of when the expert message was sent. */
  occurredAt: string;
}

/**
 * Preferences for the automated weekly sponsor impact digest email.
 */
export interface WeeklyDigestPreferences {
  /** Whether the weekly digest email is enabled. */
  enabled: boolean;
  /** IANA timezone identifier used to schedule delivery. */
  timezone: string;
  /** ISO timestamp of when the last digest was sent, if any. */
  lastSentAt?: string;
}

/** A single tree growth update included in a weekly digest. */
export interface WeeklyDigestTreeUpdate {
  treeId: string;
  species: string;
  /** URL of the tree photo to include in the digest. */
  photoUrl?: string;
  /** ISO timestamp of when the tree was planted. */
  plantedAt: string;
  /** Optional note describing the tree's growth over the week. */
  growthNote?: string;
}

/** Impact metrics summarised in a weekly digest. */
export interface WeeklyDigestImpactMetrics {
  /** Total number of trees funded by the sponsor. */
  treesFunded: number;
  /** Estimated CO2 offset in kilograms. */
  co2OffsetKg: number;
  /** Number of new trees funded during the week. */
  newTreesThisWeek: number;
}

/** A community highlight featured in a weekly digest. */
export interface WeeklyDigestCommunityHighlight {
  title: string;
  description: string;
  /** Optional URL linking to the full highlight. */
  url?: string;
}

/** Rendered weekly sponsor impact digest email. */
export interface WeeklySponsorDigestEmail {
  sponsorId: string;
  /** Recipient email address. */
  to: string;
  subject: string;
  html: string;
  text: string;
  /** ISO date (YYYY-MM-DD) of the start of the covered week. */
  weekStart: string;
  treeUpdates: WeeklyDigestTreeUpdate[];
  metrics: WeeklyDigestImpactMetrics;
  highlights: WeeklyDigestCommunityHighlight[];
}

/** Segmented sponsor groups targeted by batch newsletter campaigns. */
export type SponsorSegment = 'first_time' | 'vip' | 'lapsed' | 'regional';

/** Reusable newsletter template for a sponsor segment. */
export interface NewsletterTemplate {
  subject: string;
  htmlBody: string;
  textBody: string;
  segment: SponsorSegment;
}

export type NewsletterCampaignStatus =
  | 'draft'
  | 'scheduled'
  | 'sending'
  | 'sent'
  | 'failed';

/** A batch newsletter campaign targeting a sponsor segment. */
export interface NewsletterCampaign {
  id: string;
  name: string;
  segment: SponsorSegment;
  subject: string;
  htmlBody: string;
  textBody: string;
  status: NewsletterCampaignStatus;
  /** ISO timestamp of when the campaign is scheduled to send. */
  scheduledAt?: string;
  /** ISO timestamp of when the campaign was sent. */
  sentAt?: string;
  /** Number of recipients targeted by the campaign. */
  recipientCount: number;
}

export type NewsletterRecipientStatus =
  | 'pending'
  | 'sent'
  | 'failed'
  | 'skipped';

/** Delivery record for a single recipient of a newsletter campaign. */
export interface NewsletterRecipient {
  campaignId: string;
  sponsorId: string;
  status: NewsletterRecipientStatus;
  /** ISO timestamp of when the newsletter was sent. */
  sentAt?: string;
  /** Error message if delivery failed. */
  error?: string;
}

/** Aggregate result of a batch newsletter send. */
export interface BatchSendResult {
  campaignId: string;
  sent: number;
  failed: number;
  skipped: number;
}
