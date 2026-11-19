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
}

interface ChatMessage {
  id: string;
  author: string;
  role: 'farmer' | 'expert' | 'system';
  content: string;
  timestamp: string;
}

interface ExpertChatPageProps {
  initialTopic?: TopicCategory;
}

const POLL_INTERVAL_MS = 15000;

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
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchAvailability = useCallback(async () => {
    try {
      const res = await fetch('/api/expert-chat/availability', { cache: 'no-store' });
      if (!res.ok) {
        throw new Error('Failed to fetch availability');
      }
      const data = (await res.json()) as ExpertAvailability;
      setAvailability(data);
      setConnectionStatus('live');
    } catch {
      setConnectionStatus('offline');
    }
  }, []);

  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch('/api/expert-chat/messages', { cache: 'no-store' });
      if (!res.ok) {
        return;
      }
      const data = (await res.json()) as ChatMessage[];
      setMessages(data);
    } catch {
      // Keep existing messages on transient failures.
    }
  }, []);

  useEffect(() => {
    void fetchAvailability();
    void fetchMessages();

    pollRef.current = setInterval(() => {
      void fetchAvailability();
      void fetchMessages();
    }, POLL_INTERVAL_MS);

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [fetchAvailability, fetchMessages]);

  const handleTopicSelect = useCallback((topic: TopicCategory) => {
    setActiveTopic((current) => (current === topic ? undefined : topic));
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
          <h2 className="mb-3 text-lg font-semibold text-foreground">Message history</h2>
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
                      : 'border-border bg-card'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-foreground">{message.author}</span>
                    <time dateTime={message.timestamp} className="text-xs text-muted-foreground">
                      {formatLocalTime(message.timestamp)}
                    </time>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{message.content}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <ExpertChatPanel topic={activeTopic} />
      </div>
    </main>
  );
}
