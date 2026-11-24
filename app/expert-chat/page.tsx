'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ExpertChatPanel } from '@/components/organisms/ExpertChatPanel/ExpertChatPanel';

type TopicCategory = 'carbon-farming' | 'soil-health' | 'certification' | 'market-prices';

interface Topic {
  id: TopicCategory;
  label: string;
  description: string;
}

const TOPICS: Topic[] = [
  {
    id: 'carbon-farming',
    label: 'Carbon farming',
    description: 'Sequester carbon, reduce emissions, and understand carbon credit programs.',
  },
  {
    id: 'soil-health',
    label: 'Soil health',
    description: 'Improve soil fertility, structure, and long-term resilience on your land.',
  },
  {
    id: 'certification',
    label: 'Certification',
    description: 'Navigate organic, regenerative, and carbon certification requirements.',
  },
  {
    id: 'market-prices',
    label: 'Market prices',
    description: 'Get current pricing and market trends for your agricultural products.',
  },
];

interface ExpertAvailability {
  online: boolean;
  nextAvailable?: string;
  expertsOnline: number;
  assignedExpert?: {
    id: string;
    name: string;
    title?: string;
  } | null;
}

interface ChatMessage {
  id: string;
  author: string;
  role: 'farmer' | 'expert' | 'system';
  content: string;
  timestamp: string;
  topic?: TopicCategory;
  pending?: boolean;
  failed?: boolean;
}

interface ExpertChatPageProps {
  initialTopic?: TopicCategory;
}

const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30000;
const SSE_ENDPOINT = '/api/expert-chat/stream';
const MESSAGES_ENDPOINT = '/api/expert-chat/messages';
const AVAILABILITY_ENDPOINT = '/api/expert-chat/availability';

function useTimezone() {
  const [timezone, setTimezone] = useState<string>('UTC');

  useEffect(() => {
    try {
      const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (resolved) {
        setTimezone(resolved);
      }
    } catch {
      setTimezone('UTC');
    }
  }, []);

  const formatLocalTime = useCallback(
    (iso: string) => {
      try {
        return new Intl.DateTimeFormat(undefined, {
          hour: '2-digit',
          minute: '2-digit',
          timeZone: timezone,
          timeZoneName: 'short',
        }).format(new Date(iso));
      } catch {
        return new Date(iso).toLocaleTimeString();
      }
    },
    [timezone]
  );

  return { timezone, formatLocalTime };
}

export default function ExpertChatPage({ initialTopic }: ExpertChatPageProps) {
  const { timezone, formatLocalTime } = useTimezone();
  const [activeTopic, setActiveTopic] = useState<TopicCategory | undefined>(initialTopic);
  const [availability, setAvailability] = useState<ExpertAvailability>({
    online: false,
    expertsOnline: 0,
  });
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'live' | 'offline'>(
    'connecting'
  );
  const [draft, setDraft] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isWindowFocused, setIsWindowFocused] = useState(true);

  const sourceRef = useRef<EventSource | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const connectStreamRef = useRef<() => void>(() => {});
  const historyEndRef = useRef<HTMLDivElement | null>(null);

  const fetchAvailability = useCallback(async () => {
    try {
      const res = await fetch(AVAILABILITY_ENDPOINT, { cache: 'no-store' });
      if (!res.ok) {
        throw new Error('Failed to fetch availability');
      }
      const data = (await res.json()) as ExpertAvailability;
      if (!mountedRef.current) return;
      setAvailability(data);
    } catch {
      // Availability failures are surfaced through the stream connection status.
    }
  }, []);

  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch(MESSAGES_ENDPOINT, { cache: 'no-store' });
      if (!res.ok) {
        return;
      }
      const data = (await res.json()) as ChatMessage[];
      if (!mountedRef.current) return;
      setMessages((current) => {
        // Preserve optimistic messages that have not yet been confirmed by the server.
        const pending = current.filter((m) => m.pending || m.failed);
        const serverIds = new Set(data.map((m) => m.id));
        const stillPending = pending.filter((m) => !serverIds.has(m.id));
        return [...data, ...stillPending];
      });
    } catch {
      // Keep existing messages on transient failures.
    }
  }, []);

  const scheduleReconnect = useCallback(() => {
    if (!mountedRef.current) return;
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
    }
    const attempt = reconnectAttemptRef.current;
    const delay = Math.min(RECONNECT_BASE_MS * 2 ** attempt, RECONNECT_MAX_MS);
    reconnectAttemptRef.current = attempt + 1;
    reconnectTimerRef.current = setTimeout(() => {
      reconnectTimerRef.current = null;
      if (mountedRef.current) {
        connectStreamRef.current();
      }
    }, delay);
  }, []);

  const connectStream = useCallback(() => {
    if (!mountedRef.current) return;
    if (sourceRef.current) {
      sourceRef.current.close();
      sourceRef.current = null;
    }

    setConnectionStatus((prev) => (prev === 'live' ? prev : 'connecting'));

    try {
      const source = new EventSource(SSE_ENDPOINT);
      sourceRef.current = source;

      source.onopen = () => {
        if (!mountedRef.current) return;
        reconnectAttemptRef.current = 0;
        setConnectionStatus('live');
        void fetchAvailability();
        void fetchMessages();
      };

      source.addEventListener('message', (event) => {
        if (!mountedRef.current) return;
        try {
          const incoming = JSON.parse((event as MessageEvent).data) as ChatMessage;
          setMessages((current) => {
            const existingIndex = current.findIndex((m) => m.id === incoming.id);
            if (existingIndex >= 0) {
              const next = [...current];
              next[existingIndex] = incoming;
              return next;
            }
            return [...current, incoming];
          });
          if (incoming.role !== 'farmer' && !isWindowFocused) {
            setUnreadCount((count) => count + 1);
          }
        } catch {
          // Ignore malformed frames.
        }
      });

      source.addEventListener('availability', (event) => {
        if (!mountedRef.current) return;
        try {
          const data = JSON.parse((event as MessageEvent).data) as ExpertAvailability;
          setAvailability(data);
        } catch {
          // Ignore malformed frames.
        }
      });

      source.onerror = () => {
        if (!mountedRef.current) return;
        setConnectionStatus('offline');
        source.close();
        sourceRef.current = null;
        scheduleReconnect();
      };
    } catch {
      setConnectionStatus('offline');
      scheduleReconnect();
    }
  }, [fetchAvailability, fetchMessages, isWindowFocused, scheduleReconnect]);

  useEffect(() => {
    connectStreamRef.current = connectStream;
    mountedRef.current = true;
    void fetchAvailability();
    void fetchMessages();
    connectStream();

    return () => {
      mountedRef.current = false;
      if (sourceRef.current) {
        sourceRef.current.close();
        sourceRef.current = null;
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };
  }, [connectStream, fetchAvailability, fetchMessages]);

  useEffect(() => {
    const handleFocus = () => {
      setIsWindowFocused(true);
      setUnreadCount(0);
    };
    const handleBlur = () => setIsWindowFocused(false);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  useEffect(() => {
    if (isWindowFocused && unreadCount > 0) {
      setUnreadCount(0);
    }
  }, [isWindowFocused, unreadCount]);

  useEffect(() => {
    historyEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length]);

  const handleTopicSelect = useCallback((topic: TopicCategory) => {
    setActiveTopic((current) => (current === topic ? undefined : topic));
  }, []);

  const handleSend = useCallback(
    async (event?: React.FormEvent) => {
      event?.preventDefault();
      const content = draft.trim();
      if (!content || isSending) return;

      const optimisticId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const optimistic: ChatMessage = {
        id: optimisticId,
        author: 'You',
        role: 'farmer',
        content,
        timestamp: new Date().toISOString(),
        topic: activeTopic,
        pending: true,
      };

      setMessages((current) => [...current, optimistic]);
      setDraft('');
      setIsSending(true);

      try {
        const res = await fetch(MESSAGES_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content, topic: activeTopic }),
        });
        if (!res.ok) {
          throw new Error('Failed to send message');
        }
        const saved = (await res.json()) as ChatMessage;
        if (!mountedRef.current) return;
        setMessages((current) =>
          current.map((m) => (m.id === optimisticId ? { ...saved, pending: false } : m))
        );
      } catch {
        if (!mountedRef.current) return;
        setMessages((current) =>
          current.map((m) => (m.id === optimisticId ? { ...m, pending: false, failed: true } : m))
        );
      } finally {
        if (mountedRef.current) {
          setIsSending(false);
        }
      }
    },
    [activeTopic, draft, isSending]
  );

  const handleRetry = useCallback((message: ChatMessage) => {
    setMessages((current) => current.filter((m) => m.id !== message.id));
    setDraft(message.content);
  }, []);

  const statusLabel = useMemo(() => {
    if (connectionStatus === 'connecting') {
      return 'Connecting to experts…';
    }
    if (connectionStatus === 'offline') {
      return 'Connection lost — retrying automatically';
    }
    if (availability.online) {
      return `${availability.expertsOnline} expert${
        availability.expertsOnline === 1 ? '' : 's'
      } online now`;
    }
    return 'Experts currently offline';
  }, [availability, connectionStatus]);

  const assignedExpertLabel = useMemo(() => {
    if (!availability.assignedExpert) {
      return null;
    }
    const { name, title } = availability.assignedExpert;
    return title ? `Connected with ${name} — ${title}` : `Connected with ${name}`;
  }, [availability.assignedExpert]);

  const nextAvailableLabel = useMemo(() => {
    if (availability.online || !availability.nextAvailable) {
      return null;
    }
    return `Next available at ${formatLocalTime(availability.nextAvailable)}`;
  }, [availability, formatLocalTime]);

  return (
    <main className="min-h-screen bg-background px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-stellar-blue">
            Farmer support
          </p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
            Live chat with agricultural experts
          </h1>
          <p className="mt-4 text-lg leading-8 text-muted-foreground">
            Talk with specialists who can help you answer practical questions about carbon farming,
            soil health, certification, and current market prices.
          </p>
        </header>

        <section
          aria-label="Expert availability"
          className="mb-8 flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className={`inline-block h-3 w-3 rounded-full ${
                connectionStatus === 'live' && availability.online
                  ? 'bg-green-500'
                  : connectionStatus === 'offline'
                    ? 'bg-red-500'
                    : 'bg-yellow-500'
              }`}
            />
            <div>
              <p className="text-sm font-medium text-foreground" role="status" aria-live="polite">
                {statusLabel}
              </p>
              {nextAvailableLabel && (
                <p className="text-xs text-muted-foreground">{nextAvailableLabel}</p>
              )}
              {assignedExpertLabel && (
                <p className="text-xs text-muted-foreground">{assignedExpertLabel}</p>
              )}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Times shown in your local timezone ({timezone})
          </p>
        </section>

        <section aria-label="Chat topics" className="mb-8">
          <h2 className="mb-3 text-lg font-semibold text-foreground">
            What do you need help with?
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {TOPICS.map((topic) => {
              const isActive = activeTopic === topic.id;
              return (
                <button
                  key={topic.id}
                  type="button"
                  onClick={() => handleTopicSelect(topic.id)}
                  aria-pressed={isActive}
                  className={`rounded-xl border p-4 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-stellar-blue ${
                    isActive
                      ? 'border-stellar-blue bg-stellar-blue/10'
                      : 'border-border bg-card hover:border-stellar-blue/60'
                  }`}
                >
                  <span className="block text-sm font-semibold text-foreground">{topic.label}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {topic.description}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section aria-label="Message history" className="mb-8">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-foreground">Message history</h2>
            {unreadCount > 0 && (
              <span
                className="inline-flex items-center rounded-full bg-stellar-blue px-2.5 py-0.5 text-xs font-semibold text-white"
                aria-label={`${unreadCount} unread message${unreadCount === 1 ? '' : 's'}`}
              >
                {unreadCount} new
              </span>
            )}
          </div>
          {messages.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border bg-card p-6 text-sm text-muted-foreground">
              No messages yet. Start a conversation with an expert to see your history here.
            </p>
          ) : (
            <ul className="space-y-3" aria-live="polite">
              {messages.map((message) => (
                <li
                  key={message.id}
                  className={`rounded-xl border p-4 ${
                    message.role === 'expert'
                      ? 'border-stellar-blue/40 bg-stellar-blue/5'
                      : message.role === 'system'
                        ? 'border-dashed border-border bg-muted/40'
                        : 'border-border bg-card'
                  } ${message.pending ? 'opacity-70' : ''}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-foreground">{message.author}</span>
                    <time dateTime={message.timestamp} className="text-xs text-muted-foreground">
                      {formatLocalTime(message.timestamp)}
                    </time>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{message.content}</p>
                  {message.pending && (
                    <p className="mt-1 text-xs text-muted-foreground">Sending…</p>
                  )}
                  {message.failed && (
                    <div className="mt-1 flex items-center gap-2">
                      <p className="text-xs text-red-500">Failed to send.</p>
                      <button
                        type="button"
                        onClick={() => handleRetry(message)}
                        className="text-xs font-semibold text-stellar-blue underline focus:outline-none focus-visible:ring-2 focus-visible:ring-stellar-blue"
                      >
                        Retry
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
          <div ref={historyEndRef} />
        </section>

        <section aria-label="Send a message" className="mb-8">
          <form onSubmit={handleSend} className="flex flex-col gap-2 sm:flex-row">
            <label htmlFor="expert-chat-input" className="sr-only">
              Message to expert
            </label>
            <textarea
              id="expert-chat-input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void handleSend();
                }
              }}
              rows={2}
              placeholder={
                activeTopic
                  ? `Ask about ${TOPICS.find((t) => t.id === activeTopic)?.label ?? 'your topic'}…`
                  : 'Type your question for an agricultural expert…'
              }
              className="flex-1 resize-none rounded-xl border border-border bg-card p-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-stellar-blue"
              disabled={connectionStatus === 'offline'}
            />
            <button
              type="submit"
              disabled={!draft.trim() || isSending || connectionStatus === 'offline'}
              className="self-end rounded-xl bg-stellar-blue px-5 py-3 text-sm font-semibold text-white transition hover:bg-stellar-blue/90 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-stellar-blue"
            >
              {isSending ? 'Sending…' : 'Send'}
            </button>
          </form>
          {connectionStatus === 'offline' && (
            <p className="mt-2 text-xs text-red-500">
              You are offline. Messages will be available once the connection is restored.
            </p>
          )}
        </section>

        <ExpertChatPanel topic={activeTopic} />
      </div>
    </main>
  );
}
