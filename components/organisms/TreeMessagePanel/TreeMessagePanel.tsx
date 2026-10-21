'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { MessageSquare } from 'lucide-react';
import { Button } from '@/components/atoms/Button';
import { Text } from '@/components/atoms/Text';
import { Textarea } from '@/components/atoms/Textarea';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/molecules/Card';
import { LANGUAGE_LABELS, type SupportedLanguage } from '@/lib/i18n/config';
import { MAX_FIELD_MESSAGE_LENGTH } from '@/lib/messaging/limits';
import type { FieldThreadView } from '@/lib/types/field-messaging';

interface TreeMessagePanelProps {
  treeId: string;
  /** Wallet address of the signed-in sponsor; the panel asks them to connect when absent. */
  sponsorId?: string | null;
  /** Sponsor's current interface language; messages are translated into it. */
  language: SupportedLanguage;
}

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

/** Sponsor ↔ field team messaging on the tree profile page (#1686). */
export function TreeMessagePanel({ treeId, sponsorId, language }: TreeMessagePanelProps) {
  const [thread, setThread] = useState<FieldThreadView | null>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  const endpoint = `/api/trees/${encodeURIComponent(treeId)}/messages`;

  const load = useCallback(async () => {
    if (!sponsorId) return;
    try {
      const params = new URLSearchParams({ sponsorId, lang: language });
      const response = await fetch(`${endpoint}?${params}`);
      const data = (await response.json()) as { thread?: FieldThreadView; error?: string };
      if (!response.ok || !data.thread) throw new Error(data.error ?? 'Failed to load messages');
      setThread(data.thread);
      setError(null);
    } catch {
      setError('Could not load your messages. Please try again.');
    }
  }, [endpoint, language, sponsorId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!sponsorId || draft.trim() === '' || isSending) return;
    setIsSending(true);
    setError(null);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sponsorId, body: draft, language }),
      });
      const data = (await response.json()) as { thread?: FieldThreadView; error?: string };
      if (!response.ok || !data.thread) throw new Error(data.error ?? 'Failed to send message');
      setThread(data.thread);
      setDraft('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message');
    } finally {
      setIsSending(false);
    }
  }

  const slaDays = thread?.slaBusinessDays ?? 5;
  const translationActive = thread !== null && thread.fieldTeamLanguage !== language;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageSquare className="h-4 w-4 text-stellar-blue" aria-hidden />
          Message the field team
        </CardTitle>
        <CardDescription>
          The team looking after this tree replies within {slaDays} business days.
          {translationActive
            ? ` Messages are translated between ${LANGUAGE_LABELS[language]} and ${LANGUAGE_LABELS[thread.fieldTeamLanguage]} automatically.`
            : ''}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!sponsorId ? (
          <Text variant="muted" className="text-sm">
            Connect your wallet to message the field team about your tree.
          </Text>
        ) : (
          <>
            {thread && thread.messages.length > 0 ? (
              <ul className="space-y-3" aria-label="Messages">
                {thread.messages.map((message) => (
                  <li
                    key={message.id}
                    className={`rounded-lg border p-3 text-sm ${
                      message.senderRole === 'sponsor' ? 'bg-muted' : 'border-stellar-green/30'
                    }`}
                  >
                    <div className="mb-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span className="font-medium">
                        {message.senderRole === 'sponsor' ? 'You' : 'Field team'}
                      </span>
                      <time dateTime={message.createdAt}>{formatDate(message.createdAt)}</time>
                    </div>
                    <p className="whitespace-pre-wrap">{message.text}</p>
                    {message.translated ? (
                      <details className="mt-2 text-xs text-muted-foreground">
                        <summary className="cursor-pointer">
                          Translated from {LANGUAGE_LABELS[message.language]}
                        </summary>
                        <p className="mt-1 whitespace-pre-wrap">{message.originalText}</p>
                      </details>
                    ) : null}
                    {message.translationUnavailable ? (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Automatic translation is not available, so this is shown in{' '}
                        {LANGUAGE_LABELS[message.language]}.
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <Text variant="muted" className="text-sm">
                No messages yet. Ask the field team a question about your tree.
              </Text>
            )}

            {thread?.replyDueAt ? (
              <Text
                className={`text-sm ${thread.overdue ? 'font-medium text-destructive' : ''}`}
                role="status"
              >
                {thread.overdue
                  ? `Reply was due by ${formatDate(thread.replyDueAt)}. We are sorry for the delay.`
                  : `Reply expected by ${formatDate(thread.replyDueAt)}.`}
              </Text>
            ) : null}

            <form onSubmit={handleSubmit} className="space-y-2">
              <label htmlFor={`message-${treeId}`} className="text-sm font-medium">
                Your message
              </label>
              <Textarea
                id={`message-${treeId}`}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                maxLength={MAX_FIELD_MESSAGE_LENGTH}
                placeholder="Write in your own language"
                disabled={isSending}
              />
              <Button type="submit" disabled={isSending || draft.trim() === ''}>
                {isSending ? 'Sending…' : 'Send message'}
              </Button>
            </form>
          </>
        )}
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
