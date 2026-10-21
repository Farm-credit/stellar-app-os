import type { SupportedLanguage } from '@/lib/i18n/config';

/** Who wrote a message in a sponsor ↔ field team thread (#1686). */
export type FieldMessageSender = 'sponsor' | 'field_team';

/**
 * - `not_needed`  sponsor and field team use the same language
 * - `translated`  a translation into the reader's language is attached
 * - `unavailable` languages differ but no translation could be produced; the
 *                 original text is shown instead
 */
export type TranslationStatus = 'not_needed' | 'translated' | 'unavailable';

export interface FieldMessage {
  id: string;
  threadId: string;
  senderRole: FieldMessageSender;
  body: string;
  /** Language the message was written in. */
  language: SupportedLanguage;
  /** Translations of `body`, keyed by target language. */
  translations: Partial<Record<SupportedLanguage, string>>;
  translationStatus: TranslationStatus;
  createdAt: string;
}

/** One private thread per (tree, sponsor) pair. */
export interface FieldThread {
  id: string;
  treeId: string;
  sponsorId: string;
  sponsorLanguage: SupportedLanguage;
  fieldTeamLanguage: SupportedLanguage;
  messages: FieldMessage[];
  createdAt: string;
  updatedAt: string;
}

/** A message as shown to one reader: translated into their language when possible. */
export interface FieldMessageView {
  id: string;
  senderRole: FieldMessageSender;
  /** Text in the reader's language when a translation exists, else the original. */
  text: string;
  /** The text as written; equals `text` when no translation was used. */
  originalText: string;
  /** True when `text` is a machine translation of `originalText`. */
  translated: boolean;
  /** Set when languages differ but no translation could be produced. */
  translationUnavailable: boolean;
  language: SupportedLanguage;
  createdAt: string;
}

export interface FieldThreadView {
  treeId: string;
  sponsorLanguage: SupportedLanguage;
  fieldTeamLanguage: SupportedLanguage;
  messages: FieldMessageView[];
  /** Business days the field team has to reply. */
  slaBusinessDays: number;
  /** ISO time the oldest unanswered sponsor message is due a reply; null when nothing is waiting. */
  replyDueAt: string | null;
  /** True when `replyDueAt` has passed without a reply. */
  overdue: boolean;
}
