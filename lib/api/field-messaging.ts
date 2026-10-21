/**
 * Sponsor ↔ field team direct messaging for a tree — Issue #1686.
 *
 * One private thread per (tree, sponsor). Sponsors write from the tree profile;
 * the field team replies through the token-protected reply endpoint. Messages
 * are machine-translated when the two sides use different languages, and every
 * sponsor message carries a reply deadline of 5 business days.
 *
 * Persistence is an in-process Map, like the farmer ↔ buyer messaging service
 * (`lib/api/messaging.ts`); swap `threads` for a database layer without
 * changing the routes.
 */
import { getTreeById } from '@/lib/api/tree-registry';
import { MAX_FIELD_MESSAGE_LENGTH } from '@/lib/messaging/limits';
import { FIELD_TEAM_SLA_BUSINESS_DAYS, addBusinessDays } from '@/lib/messaging/business-days';
import {
  fieldTeamLanguageForRegion,
  isSupportedLanguage,
  translateText,
} from '@/lib/messaging/translation';
import type { SupportedLanguage } from '@/lib/i18n/config';
import type {
  FieldMessage,
  FieldMessageSender,
  FieldMessageView,
  FieldThread,
  FieldThreadView,
} from '@/lib/types/field-messaging';

export { MAX_FIELD_MESSAGE_LENGTH };

export class FieldMessagingError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 400, code = 'invalid_request') {
    super(message);
    this.name = 'FieldMessagingError';
    this.status = status;
    this.code = code;
  }
}

const threads = new Map<string, FieldThread>();
let messageCounter = 0;

const threadKey = (treeId: string, sponsorId: string) => `${treeId}::${sponsorId}`;

/** Clears all threads (tests). */
export function resetFieldMessagingForTest(): void {
  threads.clear();
  messageCounter = 0;
}

function requireText(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new FieldMessagingError(`${label} is required`);
  }
  return value.trim();
}

function validateBody(value: unknown): string {
  const body = requireText(value, 'Message');
  if (body.length > MAX_FIELD_MESSAGE_LENGTH) {
    throw new FieldMessagingError(`Message must be at most ${MAX_FIELD_MESSAGE_LENGTH} characters`);
  }
  return body;
}

async function loadTree(treeId: string) {
  const id = requireText(treeId, 'Tree id');
  const tree = await getTreeById(id);
  if (!tree) throw new FieldMessagingError('Tree not found', 404, 'not_found');
  return tree;
}

function viewMessage(message: FieldMessage, reader: SupportedLanguage): FieldMessageView {
  const translation = message.translations[reader];
  const translated = message.language !== reader && typeof translation === 'string';
  return {
    id: message.id,
    senderRole: message.senderRole,
    text: translated ? translation : message.body,
    originalText: message.body,
    translated,
    translationUnavailable: message.language !== reader && !translated,
    language: message.language,
    createdAt: message.createdAt,
  };
}

/** Oldest sponsor message that no later field team message has answered. */
function oldestUnanswered(thread: FieldThread): FieldMessage | null {
  let pending: FieldMessage | null = null;
  for (const message of thread.messages) {
    if (message.senderRole === 'field_team') pending = null;
    else if (!pending) pending = message;
  }
  return pending;
}

export function viewThread(
  thread: FieldThread,
  reader: FieldMessageSender,
  now: Date = new Date()
): FieldThreadView {
  const readerLanguage = reader === 'sponsor' ? thread.sponsorLanguage : thread.fieldTeamLanguage;
  const waiting = oldestUnanswered(thread);
  const dueAt = waiting
    ? addBusinessDays(new Date(waiting.createdAt), FIELD_TEAM_SLA_BUSINESS_DAYS)
    : null;

  return {
    treeId: thread.treeId,
    sponsorLanguage: thread.sponsorLanguage,
    fieldTeamLanguage: thread.fieldTeamLanguage,
    messages: thread.messages.map((message) => viewMessage(message, readerLanguage)),
    slaBusinessDays: FIELD_TEAM_SLA_BUSINESS_DAYS,
    replyDueAt: dueAt ? dueAt.toISOString() : null,
    overdue: dueAt ? now.getTime() > dueAt.getTime() : false,
  };
}

function emptyThread(
  treeId: string,
  sponsorId: string,
  sponsorLanguage: SupportedLanguage,
  fieldTeamLanguage: SupportedLanguage,
  now: Date
): FieldThread {
  return {
    id: `thread-${threadKey(treeId, sponsorId)}`,
    treeId,
    sponsorId,
    sponsorLanguage,
    fieldTeamLanguage,
    messages: [],
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

/** Returns the sponsor's thread for a tree (an empty one before the first message). */
export async function getSponsorThread(
  treeId: string,
  sponsorId: string,
  sponsorLanguage: unknown = 'en',
  now: Date = new Date()
): Promise<FieldThreadView> {
  const tree = await loadTree(treeId);
  const sponsor = requireText(sponsorId, 'Sponsor id');
  const language = isSupportedLanguage(sponsorLanguage) ? sponsorLanguage : 'en';
  const existing = threads.get(threadKey(tree.id, sponsor));
  const thread =
    existing ??
    emptyThread(tree.id, sponsor, language, fieldTeamLanguageForRegion(tree.region), now);
  // The reader's current language wins over what the thread was opened in.
  return viewThread({ ...thread, sponsorLanguage: language }, 'sponsor', now);
}

async function appendMessage(
  tree: { id: string; region: string },
  sponsorId: string,
  sender: FieldMessageSender,
  rawBody: unknown,
  rawLanguage: unknown,
  now: Date
): Promise<FieldThread> {
  const body = validateBody(rawBody);
  const key = threadKey(tree.id, sponsorId);
  const fieldTeamLanguage = fieldTeamLanguageForRegion(tree.region);
  const thread = threads.get(key) ?? emptyThread(tree.id, sponsorId, 'en', fieldTeamLanguage, now);

  if (sender === 'sponsor') {
    thread.sponsorLanguage = isSupportedLanguage(rawLanguage)
      ? rawLanguage
      : thread.sponsorLanguage;
  }
  const language: SupportedLanguage =
    sender === 'sponsor'
      ? thread.sponsorLanguage
      : isSupportedLanguage(rawLanguage)
        ? rawLanguage
        : thread.fieldTeamLanguage;
  const target = sender === 'sponsor' ? thread.fieldTeamLanguage : thread.sponsorLanguage;

  const outcome = await translateText(body, language, target);
  messageCounter += 1;
  const message: FieldMessage = {
    id: `fmsg-${messageCounter}`,
    threadId: thread.id,
    senderRole: sender,
    body,
    language,
    translations: outcome.text === null ? {} : { [target]: outcome.text },
    translationStatus: outcome.status,
    createdAt: now.toISOString(),
  };

  thread.messages.push(message);
  thread.updatedAt = message.createdAt;
  threads.set(key, thread);
  return thread;
}

/** A sponsor writes to the field team responsible for a tree. */
export async function sendSponsorMessage(
  input: { treeId: string; sponsorId: string; body: unknown; language?: unknown },
  now: Date = new Date()
): Promise<FieldThreadView> {
  const tree = await loadTree(input.treeId);
  const sponsorId = requireText(input.sponsorId, 'Sponsor id');
  const thread = await appendMessage(tree, sponsorId, 'sponsor', input.body, input.language, now);
  return viewThread(thread, 'sponsor', now);
}

/** The field team answers a sponsor's thread. */
export async function sendFieldTeamReply(
  input: { treeId: string; sponsorId: string; body: unknown; language?: unknown },
  now: Date = new Date()
): Promise<FieldThreadView> {
  const tree = await loadTree(input.treeId);
  const sponsorId = requireText(input.sponsorId, 'Sponsor id');
  if (!threads.has(threadKey(tree.id, sponsorId))) {
    throw new FieldMessagingError('No thread to reply to', 404, 'not_found');
  }
  const thread = await appendMessage(
    tree,
    sponsorId,
    'field_team',
    input.body,
    input.language,
    now
  );
  return viewThread(thread, 'field_team', now);
}
